import { describe, it, expect } from 'vitest';
import { InMemoryCheckpointStore } from '../../services/stateMachine/checkpoint-store.js';
import { nextRetryDelayMs, resolveRetryPolicy } from '../../services/stateMachine/retry.policy.js';
import { snapshotToJobStatus } from '../../agents/job-status-adapter.js';

describe('InMemoryCheckpointStore', () => {
  it('cria e carrega um job', async () => {
    const store = new InMemoryCheckpointStore();
    await store.create({ id: 'j1', tenantId: 't1', workflow: 'wf', lockKey: 't1' });

    const snap = await store.load('j1');
    expect(snap?.status).toBe('pending');
    expect(snap?.workflow).toBe('wf');
    expect(snap?.stages).toEqual([]);
  });

  it('lista recoverable apenas running/pending antigos', async () => {
    const store = new InMemoryCheckpointStore();
    await store.create({ id: 'j1', tenantId: 't1', workflow: 'wf', lockKey: 't1' });
    await store.create({ id: 'j2', tenantId: 't1', workflow: 'wf', lockKey: 't1' });
    await store.create({ id: 'j3', tenantId: 't1', workflow: 'other', lockKey: 't1' });

    await store.save('j1', { status: 'running' });

    const recoverable = await store.listRecoverable({ workflow: 'wf', sinceMs: 0 });
    expect(recoverable.map((r) => r.id).sort()).toEqual(['j1', 'j2']);
  });

  it('findActiveByLockKey considera pending e running', async () => {
    const store = new InMemoryCheckpointStore();
    await store.create({ id: 'j1', tenantId: 't1', workflow: 'wf', lockKey: 't1' });

    const active = await store.findActiveByLockKey('t1', 'wf');
    expect(active?.id).toBe('j1');
  });
});

describe('retry.policy', () => {
  it('backoff exponential duplica o delay por tentativa', () => {
    const policy = resolveRetryPolicy({ maxAttempts: 3, backoffMs: 100, backoffType: 'exponential' });
    expect(nextRetryDelayMs(1, policy)).toBe(100);
    expect(nextRetryDelayMs(2, policy)).toBe(200);
    expect(nextRetryDelayMs(3, policy)).toBe(400);
  });

  it('backoff fixed mantém o delay', () => {
    const policy = resolveRetryPolicy({ maxAttempts: 3, backoffMs: 500, backoffType: 'fixed' });
    expect(nextRetryDelayMs(1, policy)).toBe(500);
    expect(nextRetryDelayMs(2, policy)).toBe(500);
  });

  it('resolve default quando stage não define', () => {
    const policy = resolveRetryPolicy(undefined, { maxAttempts: 4, backoffMs: 10 });
    expect(policy.maxAttempts).toBe(4);
  });
});

describe('snapshotToJobStatus', () => {
  it('converte snapshot em JobStatus com agentProgress ordenado', () => {
    const status = snapshotToJobStatus({
      id: 'j1',
      tenantId: 't1',
      workflow: 'planner-generate',
      status: 'running',
      lockKey: 't1',
      currentStage: 'planner',
      stages: [
        { stageId: 'context', status: 'COMMITTED', attempts: 1, startedAt: '', committedAt: '' },
        { stageId: 'research', status: 'COMMITTED', attempts: 1, startedAt: '', committedAt: '' },
        { stageId: 'planner', status: 'RUNNING', attempts: 1, startedAt: '' },
      ],
      artifacts: {},
      createdAt: '',
      updatedAt: '',
    });

    expect(status.currentAgent).toBe('Planner Agent');
    expect(status.agentProgress.find((s) => s.name === 'Context Agent')?.status).toBe('completed');
    expect(status.agentProgress.find((s) => s.name === 'Planner Agent')?.status).toBe('running');
    expect(status.agentProgress.find((s) => s.name === 'Branding Agent')?.status).toBe('pending');
  });
});