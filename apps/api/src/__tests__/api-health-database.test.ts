import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Funcionalidade: Tornar falhas de conexão do banco observáveis no health check
// Cenário: O probe do banco falha com um erro de conexão contendo credenciais
// Dado que a API executa o estágio de conexão do banco
// Quando a consulta de probe falha
// Então o check db é marcado como falho com diagnóstico sanitizado

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock('@fury/db', () => ({
  db: { execute: executeMock },
}));

vi.mock('@fury/db/migrate', () => ({
  runMigrationsAndValidate: vi.fn(),
}));

vi.mock('../lib/redis.js', () => ({
  waitForRedisReady: vi.fn(),
}));

describe('health check — conexão do banco', () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
  });

  it('Cenário: falha de conexão registra check db falso sem expor credenciais', async () => {
    executeMock.mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED postgresql://fury:super-secret@db.internal:5432/fury_dev'), {
        code: 'ECONNREFUSED',
      }),
    );

    const [{ apiStartupWorkflow }, apiState] = await Promise.all([
      import('../workflows/api-startup.workflow.js'),
      import('../lib/api-state.js'),
    ]);

    await expect(apiStartupWorkflow.stages[0].execute({}, {})).rejects.toThrow('database connection failed (unavailable)');

    expect(apiState.getApiState().checks.db).toEqual(expect.objectContaining({
      ok: false,
      category: 'unavailable',
      detail: 'database connection failed (unavailable)',
    }));
    expect(apiState.getApiState().checks.db.detail).not.toContain('super-secret');
    expect(apiState.getApiState().checks.db.detail).not.toContain('postgresql://');
  });

  it('Cenário: banco acessível registra latência no check db', async () => {
    executeMock.mockResolvedValueOnce([]);

    const [{ apiStartupWorkflow }, apiState] = await Promise.all([
      import('../workflows/api-startup.workflow.js'),
      import('../lib/api-state.js'),
    ]);

    await expect(apiStartupWorkflow.stages[0].execute({}, {})).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(apiState.getApiState().checks.db).toEqual(expect.objectContaining({ ok: true }));
    expect(apiState.getApiState().checks.db.detail).toMatch(/^latency \d+ms$/);
  });

  it('Cenário: recuperação limpa a categoria de falha anterior', async () => {
    const [{ apiStartupWorkflow }, apiState] = await Promise.all([
      import('../workflows/api-startup.workflow.js'),
      import('../lib/api-state.js'),
    ]);
    executeMock
      .mockRejectedValueOnce(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce([]);

    await expect(apiStartupWorkflow.stages[0].execute({}, {})).rejects.toThrow();
    await expect(apiStartupWorkflow.stages[0].execute({}, {})).resolves.toEqual(expect.objectContaining({ ok: true }));

    expect(apiState.getApiState().checks.db).not.toHaveProperty('category');
  });

  it('Cenário: timeout e erro de query recebem categorias distintas', async () => {
    const { classifyDatabaseError } = await import('../lib/api-state.js');

    expect(classifyDatabaseError({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyDatabaseError({ code: '57014' })).toBe('timeout');
    expect(classifyDatabaseError({ code: '42601' })).toBe('query_error');
    expect(classifyDatabaseError({ code: 'ECONNRESET' })).toBe('unavailable');
  });

  it('Cenário: banco indisponível mantém o health público com diagnóstico operacional', async () => {
    const [healthRoutes, apiState] = await Promise.all([
      import('../routes/health.js'),
      import('../lib/api-state.js'),
    ]);
    const app = express();
    app.use('/health', healthRoutes.default);
    apiState.setCheck('db', false, 'database connection failed (unavailable)', 'unavailable');

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'starting',
      checks: { db: expect.objectContaining({ ok: false }) },
    }));
  });

  it('Cenário: todos os checks concluídos mantêm a resposta HTTP saudável', async () => {
    const [healthRoutes, apiState] = await Promise.all([
      import('../routes/health.js'),
      import('../lib/api-state.js'),
    ]);
    const app = express();
    app.use('/health', healthRoutes.default);
    apiState.setCheck('db', true, 'latency 2ms');
    apiState.setStatus('healthy');

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('Cenário: gate recusa demais rotas enquanto a API não está pronta', async () => {
    const { startupGate } = await import('../middleware/startup-gate.js');
    const apiState = await import('../lib/api-state.js');
    const app = express();
    app.use('/api', startupGate);
    app.get('/api/private', (_req, res) => res.json({ ok: true }));

    const response = await request(app).get('/api/private');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'SERVICE_UNAVAILABLE' });
    apiState.setStatus('healthy');
  });
});
