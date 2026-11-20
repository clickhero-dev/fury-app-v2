import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ChatApprovalRepository } from '../repository/chat-approval.repository.js';
import express from 'express';
import request from 'supertest';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';

const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL;
describe.skipIf(!url)('Journal de resultado da API com PostgreSQL real', () => {
  // describe.skipIf still executes suite collection; no URL parsing or client
  // construction may depend on an absent variable before beforeAll is skipped.
  const connectionUrl = url || 'postgresql://127.0.0.1/unconfigured_isolated';
  const parsed = new URL(connectionUrl);
  if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_isolated')) throw Error('Disposable local DB required');
  const schema = `action_journal_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(connectionUrl, { max: 1 });
  const client = postgres(connectionUrl, { max: 1, connection: { search_path: schema } });
  const tenant = randomUUID(), user = randomUUID();
  const repo = new ChatApprovalRepository(tenant, drizzle(client) as never);
  beforeAll(async () => {
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    await client.unsafe(`CREATE TABLE chat_approvals (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, user_id uuid NOT NULL,
      status text NOT NULL, result jsonb,
      method text DEFAULT 'POST', path text DEFAULT '/api/planner/posts',
      body jsonb DEFAULT '{}', expires_at timestamptz DEFAULT now()+interval '1 hour',
      execution_started_at timestamptz
    )`);
  });
  afterAll(async () => {
    await client.end();
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  async function row(status = 'executing', result: unknown = null) {
    const id = randomUUID();
    await client`INSERT INTO chat_approvals (id,tenant_id,user_id,status,result)
      VALUES(${id},${tenant},${user},${status},${JSON.stringify(result)}::jsonb)`;
    return id;
  }
  it('grava resultado e conclusão juntos, sem sobrescrever por outra resposta', async () => {
    const id = await row();
    expect(await repo.completeResult(id, user, { id: 'asset', url: 'https://example.invalid/a.png' })).toBe(true);
    expect(await repo.completeResult(id, user, { id: 'different' })).toBe(false);
    const [saved] = await client`SELECT status,result FROM chat_approvals WHERE id=${id}`;
    expect(saved.status).toBe('completed');
    expect(saved.result.id).toBe('asset');
  });
  it('não aceita outro tenant, usuário ou estado terminal de falha', async () => {
    const id = await row();
    expect(await new ChatApprovalRepository(randomUUID(), drizzle(client) as never).completeResult(id, user, {})).toBe(false);
    expect(await repo.completeResult(id, randomUUID(), {})).toBe(false);
    const failed = await row('failed');
    expect(await repo.completeResult(failed, user, { id: 'asset' })).toBe(false);
    const evidence = await row('unknown', { code: 'CHAT_OUTCOME_UNCONFIRMED', error: 'Unknown', jobId: 'actual-reference' });
    expect(await repo.completeResult(evidence, user, { id: 'different' })).toBe(false);
  });
  it('recupera resposta tardia e impede que marcação unknown apague a evidência', async () => {
    const id = await row('unknown', { error: 'Não foi possível confirmar o resultado. Verifique a ação antes de tentar novamente.' });
    expect(await repo.completeResult(id, user, { id: 'post' })).toBe(true);
    await repo.unknown(id, user);
    const [saved] = await client`SELECT status,result FROM chat_approvals WHERE id=${id}`;
    expect(saved).toMatchObject({ status: 'completed', result: { id: 'post' } });
  });
  it.each([
    { error: 'Não foi possível confirmar o resultado. Confira a ação antes de tentar novamente.' },
    { code: 'CHAT_OUTCOME_UNCONFIRMED', error: 'Texto localizado que pode mudar' },
  ])('preserva sucesso tardio mesmo depois de timeout registrado pelo Python %j', async placeholder => {
    const id = await row('unknown', placeholder);
    expect(await repo.completeResult(id, user, { id: 'late-job', jobId: 'known-job' })).toBe(true);
    const [saved] = await client`SELECT status,result FROM chat_approvals WHERE id=${id}`;
    expect(saved).toMatchObject({ status: 'completed', result: { id: 'late-job', jobId: 'known-job' } });
  });
  it('resposta HTTP só conclui com evidência durável e concorrência não duplica efeito', async () => {
    const id = await row('approved');
    const secret = 'synthetic-postgres-journal-secret-at-least-32-characters';
    const token = createChatDelegation({ userId: user, tenantId: tenant, email: 'synthetic@example.invalid', role: 'admin' }, secret);
    const app = express();
    let effects = 0;
    app.use(express.json());
    app.use(createDelegationGuard({ secret, repository: id => new ChatApprovalRepository(id, drizzle(client) as never) }));
    app.post('/api/planner/posts', (_req, res) => { effects++; res.status(201).json({ id: 'persisted-post' }); });
    app.use((error: { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? 500).json({ error: 'refused' }));
    const send = () => request(app).post('/api/planner/posts').set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', id).send({});
    const responses = await Promise.all([send(), send()]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 403]);
    expect(effects).toBe(1);
    const [saved] = await client`SELECT status,result FROM chat_approvals WHERE id=${id}`;
    expect(saved).toMatchObject({ status: 'completed', result: { id: 'persisted-post' } });
  });
});
