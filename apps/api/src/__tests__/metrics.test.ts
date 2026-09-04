import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const counterAdd = vi.fn();
const histogramRecord = vi.fn();

const meterMock = vi.hoisted(() => ({
  createCounter: vi.fn(() => ({ add: counterAdd })),
  createHistogram: vi.fn(() => ({ record: histogramRecord })),
}));

vi.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: () => meterMock },
}));

const { metricsMiddleware } = await import('../middleware/metrics.js');

function makeApp() {
  const app = express();
  app.use(metricsMiddleware);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.get('/users/:id', (_req, res) => res.status(404).json({ error: 'x' }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('metricsMiddleware', () => {
  it('conta requests por método, rota e status', async () => {
    const res = await request(makeApp()).get('/ping').expect(200);
    expect(res.status).toBe(200);
    expect(counterAdd).toHaveBeenCalledWith(1, { method: 'GET', route: '/ping', status: '200' });
  });

  it('registra duração por método e rota', async () => {
    await request(makeApp()).get('/ping');
    expect(histogramRecord).toHaveBeenCalledWith(expect.any(Number), { method: 'GET', route: '/ping' });
  });

  it('usa o pattern da rota (com :param) quando definido, não o path real', async () => {
    await request(makeApp()).get('/users/abc');
    const calls = counterAdd.mock.calls.map((c: unknown[]) => c[1]);
    expect(calls).toContainEqual({ method: 'GET', route: '/users/:id', status: '404' });
  });
});