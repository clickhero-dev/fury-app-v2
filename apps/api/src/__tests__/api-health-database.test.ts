import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Funcionalidade: Tornar falhas de conexão do banco observáveis no health check
// Cenário: O probe do banco falha com um erro de conexão contendo credenciais
// Dado que a API executa o estágio de conexão do banco
// Quando a consulta de probe falha
// Então o check db é marcado como falho com diagnóstico sanitizado

const { executeMock, workflowRunMock, captureMock } = vi.hoisted(() => ({ executeMock: vi.fn(), workflowRunMock: vi.fn(), captureMock: vi.fn() }));

vi.mock('../lib/analytics.js', () => ({ captureServerEvent: captureMock }));

vi.mock('@fury/db', () => ({
  db: { $client: { unsafe: (...args: unknown[]) => {
    const promise = executeMock(...args);
    return Object.assign(promise, { cancel: vi.fn() });
  } } },
}));

vi.mock('@fury/db/migrate', () => ({
  runMigrationsAndValidate: vi.fn(),
}));

vi.mock('../lib/redis.js', () => ({
  waitForRedisReady: vi.fn(),
}));

vi.mock('../services/stateMachine/workflow.engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/stateMachine/workflow.engine.js')>();
  return {
    ...actual,
    WorkflowEngine: class {
      run = workflowRunMock;
    },
  };
});

describe('health check — conexão do banco', () => {
  beforeEach(() => {
    vi.resetModules();
    executeMock.mockReset();
    workflowRunMock.mockReset();
    captureMock.mockReset();
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

  it('telemetria indisponível não altera o resultado da recuperação', async () => {
    const { apiStartupWorkflow } = await import('../workflows/api-startup.workflow.js');
    executeMock.mockRejectedValueOnce(Object.assign(new Error('secret'), { code: 'ECONNREFUSED' })).mockResolvedValueOnce([]);
    captureMock.mockImplementation(() => { throw new Error('telemetry down'); });
    await expect(apiStartupWorkflow.stages[0].execute({}, {})).rejects.toThrow('database connection failed (unavailable)');
    await expect(apiStartupWorkflow.stages[0].execute({}, {})).resolves.toMatchObject({ ok: true });
  });

  it('Cenário: timeout e erro de query recebem categorias distintas', async () => {
    const { classifyDatabaseError } = await import('../lib/api-state.js');

    expect(classifyDatabaseError({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyDatabaseError({ code: '57014' })).toBe('timeout');
    expect(classifyDatabaseError({ code: '42601' })).toBe('query_error');
    expect(classifyDatabaseError({ code: '42P01' })).toBe('query_error');
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
    expect((await request(app).get('/api/private')).status).toBe(200);
  });

  it('Cenário: falha terminal do banco agenda saída após a janela de diagnóstico', async () => {
    vi.useFakeTimers();
    const { WorkflowFailedError } = await import('../services/stateMachine/workflow.engine.js');
    workflowRunMock.mockRejectedValueOnce(
      new WorkflowFailedError('api-startup-global', 'db-connect', 'database connection failed (unavailable)'),
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { runApiStartupWorkflow } = await import('../workflows/api-startup-runner.js');

    await expect(runApiStartupWorkflow()).rejects.toMatchObject({ stageId: 'db-connect' });
    expect(exitSpy).not.toHaveBeenCalled();
    vi.clearAllTimers();
    vi.useRealTimers();
    exitSpy.mockRestore();
  });
});
