import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: { get: vi.fn(), setex: vi.fn() },
}));

vi.mock('../lib/redis.js', () => ({ getRedis: () => mockRedis }));

import { cacheMiddleware } from '../middleware/cache.middleware.js';

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    baseUrl: '/api/metrics',
    path: '/summary',
    query: {},
    user: { tenantId: 'tenant-1' },
    ...overrides,
  } as any;
}

function makeRes(statusCode = 200) {
  const res: any = { statusCode, headers: {} as Record<string, unknown> };
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.getHeader = (k: string) => res.headers[k];
  res.json = vi.fn(function (body: unknown) {
    res.body = body;
    return res;
  });
  return res;
}

describe('cacheMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MISS: primeira request executa o handler e grava no redis com o TTL', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.headers['X-Cache']).toBe('MISS');

    res.json({ ok: true });
    expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    const [key, ttl, value] = mockRedis.setex.mock.calls[0];
    expect(ttl).toBe(300);
    expect(key).toBe('cache:http:tenant-1:GET:/api/metrics/summary');
    expect(JSON.parse(value).body).toEqual({ ok: true });
    expect(res.body).toEqual({ ok: true });
  });

  it('HIT: request seguinte serve do redis sem executar o handler', async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({ body: { ok: true }, contentType: 'application/json' })
    );
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers['X-Cache']).toBe('HIT');
    expect(res.body).toEqual({ ok: true });
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('não cacheia resposta 4xx', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    res.statusCode = 404;
    res.json({ error: 'not found' });

    expect(mockRedis.setex).not.toHaveBeenCalled();
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('não cacheia resposta 5xx', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    res.statusCode = 500;
    res.json({ error: 'boom' });

    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('não-GET passa direto sem tocar no redis', async () => {
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedis.get).not.toHaveBeenCalled();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('request sem tenant passa direto', async () => {
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq({ user: undefined });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('erro do redis na leitura degrada para o handler', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'));
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falha de escrita loga via console.error e não quebra a resposta', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockRejectedValue(new Error('redis write fail'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const middleware = cacheMiddleware({ ttl: 300 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    res.json({ ok: true });
    await Promise.resolve(); // .catch do fire-and-forget roda no próximo microtask

    expect(res.body).toEqual({ ok: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('chave não muda com a ordem dos params de query (mesma chave → HIT)', async () => {
    const entry = JSON.stringify({ body: { ok: true }, contentType: 'application/json' });
    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });

    const res1 = makeRes();
    await middleware(makeReq({ query: { a: '1', b: '2' } }), res1, vi.fn());
    res1.json({ ok: true });

    const res2 = makeRes();
    await middleware(makeReq({ query: { b: '2', a: '1' } }), res2, vi.fn());
    expect(res2.headers['X-Cache']).toBe('HIT');
    expect(res2.body).toEqual({ ok: true });
  });

  it('chave estável com params aninhados fora de ordem (mesma chave → HIT)', async () => {
    const entry = JSON.stringify({ body: { ok: true }, contentType: 'application/json' });
    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });

    const res1 = makeRes();
    await middleware(makeReq({ query: { f: { b: '1', a: '2' } } }), res1, vi.fn());
    res1.json({ ok: true });

    const res2 = makeRes();
    await middleware(makeReq({ query: { f: { a: '2', b: '1' } } }), res2, vi.fn());
    expect(res2.headers['X-Cache']).toBe('HIT');
    expect(res2.body).toEqual({ ok: true });
  });

  it('query diferente → chave diferente (miss na segunda)', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue(undefined);
    const middleware = cacheMiddleware({ ttl: 300 });

    const res1 = makeRes();
    await middleware(makeReq({ query: { a: '1' } }), res1, vi.fn());
    res1.json({ ok: true });

    const res2 = makeRes();
    const next2 = vi.fn();
    await middleware(makeReq({ query: { a: '2' } }), res2, next2);
    res2.json({ ok: true });
    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.headers['X-Cache']).toBe('MISS');
  });
});

function nextCalled(res: any): boolean {
  return res.headers['X-Cache'] === undefined;
}
