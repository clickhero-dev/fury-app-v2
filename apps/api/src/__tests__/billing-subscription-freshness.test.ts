/*
Funcionalidade: consultar o estado atual da assinatura sem reutilizar cache HTTP
Cenário: o status muda entre duas consultas
Dado que a resposta da assinatura já foi consultada uma vez
Quando uma segunda consulta autenticada é feita
Então a API deve executar novamente o controller e devolver o estado atual
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const { cacheEntries, getSubscription, mockRedis, controllers } = vi.hoisted(() => {
  const cacheEntries = new Map<string, string>();
  const mockRedis = {
    get: vi.fn(async (key: string) => cacheEntries.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      cacheEntries.set(key, value);
    }),
  };
  const getSubscription = vi.fn();
  const inertHandler = (_req: unknown, res: any) => res.json({ success: true, data: null });
  const controllers = {
    billing: {
      listPlans: inertHandler,
      webhook: inertHandler,
      subscribe: inertHandler,
      getSubscription,
      listInvoices: inertHandler,
      cancel: inertHandler,
    },
  };
  return { cacheEntries, getSubscription, mockRedis, controllers };
});

vi.mock('../di.js', () => ({ controllers }));
vi.mock('../lib/redis.js', () => ({ getRedis: () => mockRedis }));

import routes from '../routes/billing.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

function buildApp() {
  const app = express();
  app.use('/api/billing', routes);
  app.use(errorHandler);
  return app;
}

function authHeader() {
  const token = jwt.sign(
    { userId: 'user-1', tenantId: 'tenant-1', email: 'test@example.com', role: 'owner' },
    process.env.JWT_SECRET!
  );
  return { Authorization: `Bearer ${token}` };
}

describe('BDD: consulta atual de assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheEntries.clear();
    getSubscription.mockImplementation((_req: unknown, res: any) =>
      res.json({ success: true, data: { revision: getSubscription.mock.calls.length } })
    );
  });

  it('Cenário: duas consultas recebem o estado atual do controller', async () => {
    const app = buildApp();
    const first = await request(app).get('/api/billing/subscription').set(authHeader());
    const second = await request(app).get('/api/billing/subscription').set(authHeader());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-cache']).toBeUndefined();
    expect(second.headers['x-cache']).toBeUndefined();
    expect(first.body.data.revision).toBe(1);
    expect(second.body.data.revision).toBe(2);
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });
});
