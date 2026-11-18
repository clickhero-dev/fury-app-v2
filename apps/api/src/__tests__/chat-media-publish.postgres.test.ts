import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
vi.mock('@fury/db', () => ({db:{}}));
import { ChatMediaPublishRepository } from '../repository/chat-media-publish.repository.js';

const url = process.env.CHAT_PLAN_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = `media_publish_${randomUUID().replaceAll('-','')}`;
const tenant=randomUUID(), user=randomUUID(), approval=randomUUID();
let client:ReturnType<typeof postgres>, repo:ChatMediaPublishRepository;
suite('publicação de mídia no PostgreSQL isolado', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_isolated')) throw new Error('Use banco isolado');
    client = postgres(url!, {connection:{search_path:schema},onnotice:()=>{}});
    await client.unsafe(`CREATE SCHEMA ${schema}; CREATE TABLE chat_approvals(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,user_id uuid NOT NULL,path text NOT NULL,status text NOT NULL,result jsonb)`);
    await client.unsafe(await readFile(new URL('../../../../packages/db/migrations/0083_chat_media_publish.sql',import.meta.url),'utf8'));
    await client`INSERT INTO chat_approvals(id,tenant_id,user_id,path,status,result) VALUES (${approval},${tenant},${user},'/api/studio/ai/generate-image','completed',${client.json({imageUrl:'https://example.com/a.png'})})`;
    repo = new ChatMediaPublishRepository(drizzle(client) as never);
  });
  afterAll(async () => { if (client) { await client.unsafe(`DROP SCHEMA ${schema} CASCADE`); await client.end(); } });
  it('isola usuário e tenant e garante uma única aquisição concorrente', async () => {
    expect(await repo.findMedia(tenant,user,approval)).toEqual({kind:'image',url:'https://example.com/a.png'});
    expect(await repo.findMedia(randomUUID(),user,approval)).toBeNull();
    expect(await repo.findMedia(tenant,randomUUID(),approval)).toBeNull();
    const claims = await Promise.all([repo.claim(tenant,user,approval),repo.claim(tenant,user,approval)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await repo.result(tenant,user,approval)).toBeNull();
    await repo.finish(tenant,user,approval,{status:'published',id:'post'});
    expect(await repo.result(tenant,user,approval)).toEqual({status:'published',id:'post'});
    expect(await repo.result(tenant,randomUUID(),approval)).toBeNull();
  });
});
