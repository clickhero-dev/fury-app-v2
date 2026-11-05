import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowFailedError, RetryDependencyError } from '../../services/stateMachine/workflow.engine.js';
import { InMemoryCheckpointStore } from '../../services/stateMachine/checkpoint-store.js';
import type { WorkflowDefinition } from '../../services/stateMachine/stageInterface.js';

interface TestCtx { tenantId: string }

function makeWorkflow(overrides: Partial<WorkflowDefinition<TestCtx>> = {}): WorkflowDefinition<TestCtx> {
  return {
    id: 'test-workflow',
    lockKey: (ctx) => ctx.tenantId,
    defaultRetry: { maxAttempts: 2, backoffMs: 0 },
    stages: [
      { id: 'a', artifactKey: 'a', execute: () => ({ value: 1 }) },
      { id: 'b', deps: ['a'], artifactKey: 'b', execute: (_ctx, artifacts) => ({ sum: (artifacts.a as any).value + 1 }) },
      { id: 'c', deps: ['b'], artifactKey: 'c', execute: (_ctx, artifacts) => ({ sum: (artifacts.b as any).sum + 1 }) },
    ],
    ...overrides,
  };
}

describe('WorkflowEngine', () => {
  let store: InMemoryCheckpointStore;
  let ctx: TestCtx;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
    ctx = { tenantId: 'tenant-1' };
  });

  it('executa stages em ordem topológica e persiste checkpoints', async () => {
    const engine = new WorkflowEngine(makeWorkflow(), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await engine.run('job-1', ctx);

    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('done');
    expect(snapshot?.stages.every((t) => t.status === 'COMMITTED')).toBe(true);
    expect(snapshot?.artifacts.c).toEqual({ sum: 3 });
  });

  it('aplica retry policy e conclui após nova tentativa', async () => {
    const failing = vi.fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockResolvedValue({ ok: true });

    const engine = new WorkflowEngine(makeWorkflow({
      defaultRetry: { maxAttempts: 2, backoffMs: 0, backoffType: 'fixed' },
      stages: [
        { id: 'a', artifactKey: 'a', execute: failing },
      ],
    }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await engine.run('job-1', ctx);

    expect(failing).toHaveBeenCalledTimes(2);
    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('done');
    expect(snapshot?.artifacts.a).toEqual({ ok: true });
  });

  it('marca job como error quando as tentativas esgotam', async () => {
    const alwaysFail = vi.fn().mockRejectedValue(new Error('sempre falha'));
    const engine = new WorkflowEngine(makeWorkflow({
      defaultRetry: { maxAttempts: 1, backoffMs: 0 },
      stages: [{ id: 'a', artifactKey: 'a', execute: alwaysFail }],
    }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await expect(engine.run('job-1', ctx)).rejects.toBeInstanceOf(WorkflowFailedError);

    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('error');
    expect(snapshot?.error).toContain('sempre falha');
    expect(snapshot?.stages.find((t) => t.stageId === 'a')?.status).toBe('FAILED');
  });

  it('retoma de checkpoint pulando stages COMMITTED', async () => {
    const runTimes: string[] = [];
    const stages = [
      { id: 'a', artifactKey: 'a', execute: vi.fn(async () => { runTimes.push('a'); return { v: 1 }; }) },
      { id: 'b', deps: ['a'], artifactKey: 'b', execute: vi.fn(async () => { runTimes.push('b'); return { v: 2 }; }) },
      { id: 'c', deps: ['b'], artifactKey: 'c', execute: vi.fn(async () => { runTimes.push('c'); return { v: 3 }; }) },
    ];
    const engine = new WorkflowEngine(makeWorkflow({ stages }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    // Simula crash após o stage 'a' commitado
    await store.save('job-1', {
      status: 'running',
      currentStage: 'a',
      stages: [{ stageId: 'a', status: 'COMMITTED', attempts: 1, startedAt: new Date().toISOString(), committedAt: new Date().toISOString() }],
      artifacts: { a: { v: 1 } },
    });

    await engine.run('job-1', ctx, { resume: true });

    // 'a' não deve re-executar
    expect(runTimes).toEqual(['b', 'c']);
    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('done');
  });

  it('executa rollback do stage quando falha e desmarca artefato', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined);
    const engine = new WorkflowEngine(makeWorkflow({
      defaultRetry: { maxAttempts: 1, backoffMs: 0 },
      stages: [
        { id: 'a', artifactKey: 'a', execute: () => ({ v: 1 }) },
        { id: 'b', deps: ['a'], artifactKey: 'b', execute: () => { throw new Error('falha no b'); }, rollback },
      ],
    }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await expect(engine.run('job-1', ctx)).rejects.toBeInstanceOf(WorkflowFailedError);

    expect(rollback).toHaveBeenCalledTimes(1);
    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('error');
    expect(snapshot?.currentStage).toBe('b');
  });

  it('re-executa dependência quando o stage lança RetryDependencyError', async () => {
    const copywriter = vi.fn().mockResolvedValue({ version: 1 });
    const quality = vi.fn()
      .mockImplementationOnce(() => { throw new RetryDependencyError('copywriter', 'quality falhou'); })
      .mockResolvedValue({ passed: true });

    const engine = new WorkflowEngine(makeWorkflow({
      defaultRetry: { maxAttempts: 3, backoffMs: 0 },
      stages: [
        { id: 'copywriter', artifactKey: 'copywriter', execute: copywriter },
        { id: 'quality', deps: ['copywriter'], artifactKey: 'quality', execute: quality },
      ],
    }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await engine.run('job-1', ctx);

    expect(copywriter).toHaveBeenCalledTimes(2);
    expect(quality).toHaveBeenCalledTimes(2);
    const snapshot = await store.load('job-1');
    expect(snapshot?.status).toBe('done');
  });

  it('workflow.rollback executa rollback dos stages commitados em ordem reversa', async () => {
    const order: string[] = [];
    const stages = [
      { id: 'a', artifactKey: 'a', execute: () => ({ v: 1 }), rollback: vi.fn(async () => { order.push('a'); }) },
      { id: 'b', deps: ['a'], artifactKey: 'b', execute: () => ({ v: 2 }), rollback: vi.fn(async () => { order.push('b'); }) },
      { id: 'c', deps: ['b'], artifactKey: 'c', execute: () => ({ v: 3 }), rollback: vi.fn(async () => { order.push('c'); }) },
    ];
    const engine = new WorkflowEngine(makeWorkflow({ stages }), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });

    await engine.run('job-1', ctx);
    await engine.rollback('job-1', ctx);

    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('lockKey diferencia jobs ativos por tenant', async () => {
    const engine = new WorkflowEngine(makeWorkflow(), store);
    await store.create({ id: 'job-1', tenantId: 'tenant-1', workflow: 'test-workflow', lockKey: 'tenant-1' });
    await store.create({ id: 'job-2', tenantId: 'tenant-2', workflow: 'test-workflow', lockKey: 'tenant-2' });
    await store.save('job-1', { status: 'running' });
    await store.save('job-2', { status: 'done' });

    const active1 = await store.findActiveByLockKey('tenant-1', 'test-workflow');
    const active2 = await store.findActiveByLockKey('tenant-2', 'test-workflow');
    expect(active1?.id).toBe('job-1');
    expect(active2).toBeNull();
  });
});