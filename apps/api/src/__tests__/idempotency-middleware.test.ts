// =============================================================================
// Testes unitários do middleware de idempotência (T006).
// Comportamento: header obrigatório (400), replay estrito (mesma resposta),
// inflight (409), commit da resposta 2xx/4xx, release em 5xx, Redis down (503).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.middleware.js';

function makeStoreFake(overrides: Record<string, any> = {}) {
  return {
    getStoredResponse: vi.fn(async () => null),
    tryBegin: vi.fn(async () => true),
    commitResponse: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    status: vi.fn(function (this: any, code: number) { res.statusCode = code; return res; }),
    json: vi.fn(function (this: any, body: unknown) { res.body = body; return res; }),
  };
  return res;
}

function makeReq(header?: string, tenantId = 't1') {
  return {
    get: (name: string) => (name.toLowerCase() === 'idempotency-key' ? header : undefined),
    tenant: { tenantId },
  } as any;
}

beforeEach(() => vi.clearAllMocks());

describe('idempotency middleware', () => {
  it('Cenário: sem header Idempotency-Key → next(AppError 400 IDEMPOTENCY_KEY_REQUIRED)', async () => {
    const store = makeStoreFake();
    const mw = createIdempotencyMiddleware(store as never);
    const next = vi.fn();

    await mw(makeReq(undefined), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('Cenário: key nova → tryBegin true → next() chamado (request segue)', async () => {
    const store = makeStoreFake();
    const mw = createIdempotencyMiddleware(store as never);
    const next = vi.fn();
    const res = makeRes();

    await mw(makeReq('key-A'), res, next);

    expect(store.tryBegin).toHaveBeenCalledWith('t1', 'key-A');
    expect(next).toHaveBeenCalledWith(); // sem erro
  });

  it('Cenário: resposta já armazenada → replay ESTRITO (mesmo status + body), handler nunca roda', async () => {
    const stored = { status: 201, body: { success: true, data: { id: 'post-1', status: 'failed' } } };
    const store = makeStoreFake({
      getStoredResponse: vi.fn(async () => stored),
      tryBegin: vi.fn(async () => false),
    });
    const mw = createIdempotencyMiddleware(store as never);
    const next = vi.fn();
    const res = makeRes();

    await mw(makeReq('key-A'), res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(stored.body);
    expect(next).not.toHaveBeenCalled();
  });

  it('Cenário: key em andamento (inflight, sem resposta) → next(AppError 409 IN_PROGRESS)', async () => {
    const store = makeStoreFake({ tryBegin: vi.fn(async () => false) });
    const mw = createIdempotencyMiddleware(store as never);
    const next = vi.fn();

    await mw(makeReq('key-A'), makeRes(), next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('IDEMPOTENCY_REQUEST_IN_PROGRESS');
  });

  it('Cenário: handler responde 201 → commitResponse com status+body (replay futuro)', async () => {
    const store = makeStoreFake();
    const mw = createIdempotencyMiddleware(store as never);
    const res = makeRes();

    await mw(makeReq('key-A'), res, vi.fn());
    await res.status(201).json({ success: true, data: { id: 'p1' } });

    expect(store.commitResponse).toHaveBeenCalledWith('t1', 'key-A', 201, { success: true, data: { id: 'p1' } });
    expect(store.release).not.toHaveBeenCalled();
  });

  it('Cenário: handler responde 500 → release (NÃO armazena falha de infra)', async () => {
    const store = makeStoreFake();
    const mw = createIdempotencyMiddleware(store as never);
    const res = makeRes();

    await mw(makeReq('key-A'), res, vi.fn());
    await res.status(500).json({ success: false });

    expect(store.release).toHaveBeenCalledWith('t1', 'key-A');
    expect(store.commitResponse).not.toHaveBeenCalled();
  });

  it('Cenário: Redis indisponível (store lança) → next(AppError 503 IDEMPOTENCY_STORE_UNAVAILABLE) — fail-closed', async () => {
    const store = makeStoreFake({ tryBegin: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) });
    const mw = createIdempotencyMiddleware(store as never);
    const next = vi.fn();

    await mw(makeReq('key-A'), makeRes(), next);

    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
  });
});
