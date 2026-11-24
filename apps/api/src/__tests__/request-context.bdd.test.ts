/* Dado requestLogger, quando encaminhar, então o contexto usa o ID emitido no header. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@fury/db', () => ({ db: {}, requestLogs: {} }));
vi.mock('../middleware/chat-delegation.middleware.js', () => ({ getDelegatedUser: vi.fn() }));
import { requestLogger } from '../middleware/request-logger.js';
import { requestContext } from '../lib/request-context.js';
it('Cenário: header validado → contexto e resposta com o mesmo ID', () => {
  const id = 'd9a1b9a1-0000-4000-8000-000000000001';
  const res = { setHeader: vi.fn(), on: vi.fn() };
  requestLogger({ method: 'POST', path: '/api/planner/posts/suggest-caption', headers: { 'x-request-id': id }, body: {} } as never, res as never, () => {
    expect(requestContext.getStore()).toEqual({ requestId: id, path: '/api/planner/posts/suggest-caption' });
  });
  expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  expect(requestContext.getStore()).toBeUndefined();
});
