import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatProfileRepository } from '../repository/chat-profile.repository.js';
import express from 'express';
import request from 'supertest';
import { ChatProfileService } from '../services/core/chat-profile.service.js';
import { ChatProfileController } from '../controllers/chat-profile.controller.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

const url = process.env.CHAT_PLAN_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = `guided_profile_${randomUUID().replaceAll('-', '')}`;
let pg: ReturnType<typeof postgres>;
let repo: ChatProfileRepository;
const tenant = randomUUID(), user = randomUUID(), conversationId = randomUUID();
const values = { tenantName: 'Loja Ana', businessContext: 'Produtos ou serviços: Flores' };
async function turn(expected?: Record<string, string>) {
  const message = randomUUID(), runId = randomUUID(), leaseId = randomUUID();
  const [versions] = await pg`SELECT u.xmin::text AS "userVersion",t.xmin::text AS "tenantVersion" FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=${user}`;
  await pg`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES(${message},${conversationId},'user','Flores')`;
  await pg`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES(${runId},${conversationId},${message},${leaseId},'running',clock_timestamp()+interval '1 minute')`;
  await pg`INSERT INTO chat_guided_setup_receipts(conversation_id,user_message_id,result) VALUES(${conversationId},${message},${JSON.stringify({ profileUpdate: values, profileExpected: expected ?? { userVersion: versions.userVersion, tenantVersion: versions.tenantVersion }, nameVersionConfirmed: true })}::jsonb)`;
  return { conversationId, runId, leaseId };
}
suite('guided profile transaction in PostgreSQL', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_isolated')) throw Error('isolated DB required');
    pg = postgres(url!, { max: 6, connection: { search_path: schema }, onnotice: () => {} });
    await pg.unsafe(`CREATE SCHEMA ${schema}; CREATE TABLE tenants(id uuid PRIMARY KEY,name text NOT NULL,slug text UNIQUE,business_context text,deleted_at timestamptz); CREATE TABLE users(id uuid PRIMARY KEY,tenant_id uuid REFERENCES tenants(id),name text,deleted_at timestamptz);`);
    for (const name of ['0059_chat.sql','0066_chat_response_runs.sql','0085_chat_guided_setup_receipts.sql','0086_chat_guided_profile_effects.sql']) await pg.unsafe(await readFile(new URL(`../../../../packages/db/migrations/${name}`, import.meta.url), 'utf8'));
    await pg`INSERT INTO tenants(id,name,slug) VALUES(${tenant},'Original','original')`;
    await pg`INSERT INTO users(id,tenant_id,name) VALUES(${user},${tenant},'Ana')`;
    await pg`INSERT INTO chat_conversations(id,tenant_id,user_id,title) VALUES(${conversationId},${tenant},${user},'Test')`;
    repo = new ChatProfileRepository(tenant, drizzle(pg) as never);
  });
  afterAll(async () => { if (pg) { await pg.unsafe(`DROP SCHEMA ${schema} CASCADE`); await pg.end(); } });
  it('serializes identical concurrent writes and replays without changing xmin', async () => {
    const fence = await turn();
    const [a,b] = await Promise.all([repo.applyGuided(user,values,fence),repo.applyGuided(user,values,fence)]);
    expect(a).toEqual(b);
    const [row] = await pg`SELECT name,slug,business_context,xmin::text AS version FROM tenants WHERE id=${tenant}`;
    expect(row).toMatchObject({ name: values.tenantName, slug: 'loja-ana', business_context: values.businessContext });
    expect(await repo.applyGuided(user,values,fence)).toEqual(a);
    expect((await pg`SELECT xmin::text AS version FROM tenants WHERE id=${tenant}`)[0].version).toBe(row.version);
    await expect(repo.applyGuided(user,{...values,tenantName:'Outro'},fence)).rejects.toMatchObject({statusCode:409});
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
    const [old] = await pg`SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId}`;
    const newRun = randomUUID(), newLease = randomUUID();
    await pg`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES(${newRun},${conversationId},${old.user_message_id},${newLease},'running',clock_timestamp()+interval '1 minute')`;
    expect(await repo.applyGuided(user,values,{conversationId,runId:newRun,leaseId:newLease})).toEqual(a);
    expect((await pg`SELECT xmin::text AS version FROM tenants WHERE id=${tenant}`)[0].version).toBe(row.version);
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${newRun}`;
  });
  it('rejects changed versions, incorrect payload, wrong scope and expired lease without effects', async () => {
    const fence = await turn();
    await expect(repo.applyGuided(user,{...values,tenantName:'Outro'},fence)).rejects.toMatchObject({statusCode:409});
    await expect(repo.applyGuided(randomUUID(),values,fence)).rejects.toMatchObject({statusCode:404});
    await pg`UPDATE users SET name='Editado' WHERE id=${user}`;
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({code:'PROFILE_CHANGED'});
    await pg`UPDATE chat_response_runs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${fence.runId}`;
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({code:'CHAT_RUN_EXPIRED'});
    expect(await pg`SELECT * FROM chat_guided_profile_effects WHERE conversation_id=${conversationId} AND user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`).toHaveLength(0);
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('fails closed when receipt lacks versions', async () => {
    const fence = await turn({});
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({statusCode:409});
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('rejects a legacy pending receipt without changing the profile or recording an effect', async () => {
    const fence = await turn();
    await pg`UPDATE chat_guided_setup_receipts SET result=result-'nameVersionConfirmed' WHERE user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`;
    const before = await repo.snapshot(user);
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({code:'CHAT_GUIDED_RECEIPT_MISMATCH'});
    expect(await repo.snapshot(user)).toEqual(before);
    expect(await pg`SELECT * FROM chat_guided_profile_effects WHERE user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`).toHaveLength(0);
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('replays a legacy applied receipt only while authorization and existing checks remain valid', async () => {
    const fence = await turn();
    const applied = await repo.applyGuided(user,values,fence);
    await pg`UPDATE chat_guided_setup_receipts SET result=result-'nameVersionConfirmed' WHERE user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`;
    expect(await repo.applyGuided(user,values,fence)).toEqual(applied);
    expect(await repo.snapshot(user)).toEqual(applied);
    await expect(repo.applyGuided(user,{...values,tenantName:'Outro'},fence)).rejects.toMatchObject({code:'CHAT_GUIDED_RECEIPT_MISMATCH'});
    await expect(repo.applyGuided(randomUUID(),values,fence)).rejects.toMatchObject({statusCode:404});
    await pg`UPDATE tenants SET business_context='Edição posterior' WHERE id=${tenant}`;
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({code:'CHAT_GUIDED_PROFILE_SUPERSEDED'});
    expect((await repo.snapshot(user))?.businessContext).toBe('Edição posterior');
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('rejects slug collisions and leaves no effect', async () => {
    const otherTenant = randomUUID();
    await pg`INSERT INTO tenants(id,name,slug) VALUES(${otherTenant},'Loja Ana','outro-slug')`;
    const fence = await turn();
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({code:'SLUG_EXISTS'});
    expect(await pg`SELECT * FROM chat_guided_profile_effects WHERE user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`).toHaveLength(0);
    await pg`DELETE FROM tenants WHERE id=${otherTenant}`;
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('rechecks the lease after waiting for the profile lock', async () => {
    const fence = await turn();
    let pending!: Promise<unknown>;
    await pg.begin(async tx => {
      await tx`SELECT id FROM tenants WHERE id=${tenant} FOR UPDATE`;
      await tx`UPDATE chat_response_runs SET lease_until=clock_timestamp()+interval '200 milliseconds' WHERE id=${fence.runId}`;
      pending = repo.applyGuided(user,values,fence);
      void pending.catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    await expect(pending).rejects.toMatchObject({code:'CHAT_RUN_EXPIRED'});
    expect(await pg`SELECT * FROM chat_guided_profile_effects WHERE user_message_id=(SELECT user_message_id FROM chat_response_runs WHERE id=${fence.runId})`).toHaveLength(0);
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('does not replay an effect after profile access has been revoked', async () => {
    const fence = await turn();
    await repo.applyGuided(user,values,fence);
    await pg`UPDATE users SET deleted_at=clock_timestamp() WHERE id=${user}`;
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({statusCode:409});
    await pg`UPDATE users SET deleted_at=null WHERE id=${user}`;
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('reports a superseded effect without overwriting a later manual edit', async () => {
    const fence = await turn();
    await repo.applyGuided(user,values,fence);
    await pg`UPDATE tenants SET business_context='Edição manual' WHERE id=${tenant}`;
    await expect(repo.applyGuided(user,values,fence)).rejects.toMatchObject({statusCode:409,code:'CHAT_GUIDED_PROFILE_SUPERSEDED'});
    expect((await pg`SELECT business_context FROM tenants WHERE id=${tenant}`)[0].business_context).toBe('Edição manual');
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('enforces real delegated HTTP authentication, scope, fence and strict input', async () => {
    const fence = await turn(), secret = 'isolated-secret-for-delegation-123456789';
    const token = (tenantId: string, userId: string) => createChatDelegation({ tenantId, userId, role:'member', email:'test@example.com' },secret);
    const server = express(); server.use(express.json());
    server.use(createDelegationGuard({secret,repository: () => { throw Error('approval should not be used'); }}));
    server.post('/api/auth/me/chat-guided-update',authMiddleware,tenantMiddleware,new ChatProfileController(new ChatProfileService(id => new ChatProfileRepository(id,drizzle(pg) as never))).guidedUpdate);
    server.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode || (err.name === 'ZodError' ? 400 : 500)).json({code:err.code}));
    const send = () => request(server).post('/api/auth/me/chat-guided-update');
    expect((await send().send({...values,...fence})).status).toBe(401);
    expect((await send().auth(token(tenant,user),{type:'bearer'}).send({...values})).status).toBe(400);
    expect((await send().auth(token(randomUUID(),user),{type:'bearer'}).send({...values,...fence})).status).toBe(404);
    expect((await send().auth(token(tenant,user),{type:'bearer'}).send({...values,...fence,leaseId:randomUUID()})).status).toBe(409);
    const first = await send().auth(token(tenant,user),{type:'bearer'}).send({...values,...fence});
    const replay = await send().auth(token(tenant,user),{type:'bearer'}).send({...values,...fence});
    expect(first.status).toBe(200); expect(replay.body).toEqual(first.body);
    await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
  });
  it('exposes the real controller through the cross-service process harness', async () => {
    const fence = await turn(), secret = 'isolated-secret-for-delegation-123456789';
    const child = spawn(process.execPath, ['--import','tsx',fileURLToPath(new URL('./guided-profile-real-server.ts', import.meta.url))], {
      cwd: process.cwd(), env: { ...process.env, CHAT_MEDIA_TEST_DATABASE_URL:url!, CHAT_CROSS_SERVICE_SCHEMA:schema, CHAT_DELEGATION_SECRET:secret, DATABASE_URL:url! },
      stdio: ['ignore','pipe','inherit'],
    });
    try {
      const lines = createInterface({ input: child.stdout });
      const [line] = await Promise.race([once(lines,'line'), once(child,'exit').then(() => { throw Error('harness exited'); })]);
      const {port} = JSON.parse(String(line));
      const token = createChatDelegation({tenantId:tenant,userId:user,role:'member',email:'test@example.com'},secret);
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me/chat-guided-update`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...values,...fence})});
      expect(response.status).toBe(200);
      expect((await response.json()).data.tenantName).toBe(values.tenantName);
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child,'exit').catch(() => {}); }
      await pg`UPDATE chat_response_runs SET status='completed' WHERE id=${fence.runId}`;
    }
  });
});
