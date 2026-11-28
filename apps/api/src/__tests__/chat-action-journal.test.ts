import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';

const secret = 'synthetic-journal-secret-at-least-32-characters';
const user = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'admin', email: 'synthetic@example.invalid' };
const approvalId = '33333333-3333-4333-8333-333333333333';
const token = createChatDelegation(user, secret);

function server(completeResult: (...args: unknown[]) => Promise<boolean>, body: Record<string, unknown> = { id: 'created-post', status: 'approved' }) {
  const complete = vi.fn().mockResolvedValue(undefined);
  const unknown = vi.fn().mockResolvedValue(undefined);
  const app = express();
  app.use(express.json());
  app.use(createDelegationGuard({
    secret, repository: () => ({ consume: async () => true, complete, unknown, completeResult }),
  }));
  app.post('/api/planner/posts', (_req, res) => res.status(201).json(body));
  return { app, complete, unknown };
}
function send(app: express.Express) {
  return request(app).post('/api/planner/posts')
    .set('Authorization', `Bearer ${token}`).set('X-Chat-Approval-Id', approvalId).send({});
}

describe('Journal autoritativo antes da resposta de efeito externo', () => {
  it('não envia sucesso antes de persistir resultado e estado juntos', async () => {
    let resolve!: (value: boolean) => void;
    const completeResult = vi.fn().mockImplementation(() => new Promise<boolean>(done => { resolve = done; }));
    const { app, complete } = server(completeResult);
    let received = false;
    const pending = send(app).then(response => { received = true; return response; });
    await vi.waitFor(() => expect(completeResult).toHaveBeenCalled());
    expect(received).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(completeResult).toHaveBeenCalledWith(approvalId, user.userId, { id: 'created-post', status: 'approved' });
    resolve(true);
    const response = await pending;
    expect(response.status).toBe(201);
    expect(response.body.id).toBe('created-post');
  });

  it('falha de persistência não vira sucesso e não expõe diagnóstico', async () => {
    const { app, unknown } = server(vi.fn().mockRejectedValue(new Error('private database diagnostics')));
    const response = await send(app);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CHAT_OUTCOME_UNCONFIRMED');
    expect(JSON.stringify(response.body)).not.toContain('private');
    await vi.waitFor(() => expect(unknown).toHaveBeenCalledWith(approvalId, user.userId));
  });

  it('conflito de journal não permite sobrescrever resultado nem alegar sucesso', async () => {
    const { app } = server(async () => false);
    const response = await send(app);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('CHAT_OUTCOME_UNCONFIRMED');
  });
  it('congela o mesmo resultado para persistência e resposta mesmo se o objeto original mudar', async () => {
    const body = { id: 'created-post' };
    let resolve!: (value: boolean) => void;
    const completeResult = vi.fn().mockImplementation(() => new Promise<boolean>(done => { resolve = done; }));
    const { app } = server(completeResult, body);
    const pending = send(app).then(response => response);
    await vi.waitFor(() => expect(completeResult).toHaveBeenCalled());
    body.id = 'changed-after-return';
    resolve(true);
    expect((await pending).body.id).toBe('created-post');
    expect(completeResult.mock.calls[0][2]).toEqual({ id: 'created-post' });
  });
});
