import { describe, expect, it } from 'vitest';
import { snapshotToJobStatus } from '../agents/job-status-adapter.js';

function snapshot(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    tenantId: 't-1',
    status,
    stages: [],
    currentStage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  } as any;
}

describe('snapshotToJobStatus — contrato de `state` para o frontend', () => {
  it('pending → INITIALIZING', () => {
    expect(snapshotToJobStatus(snapshot('pending')).state).toBe('INITIALIZING');
  });

  it('running → WORKING com progresso', () => {
    const out = snapshotToJobStatus(snapshot('running'));
    expect(out.state).toBe('WORKING');
    expect(out.agentProgress).toBeInstanceOf(Array);
  });

  it('awaiting_images → WORKING (status generating)', () => {
    const out = snapshotToJobStatus(snapshot('awaiting_images'));
    expect(out.state).toBe('WORKING');
    expect(out.status).toBe('generating');
  });

  it('done → DONE (o frontend para o polling e mostra o resumo)', () => {
    const out = snapshotToJobStatus(snapshot('done', { planId: 'plan-9' }));
    expect(out.state).toBe('DONE');
    expect(out.planId).toBe('plan-9');
  });

  it('error → ERROR com a mensagem', () => {
    const out = snapshotToJobStatus(snapshot('error', { error: 'Falha na geração' }));
    expect(out.state).toBe('ERROR');
    expect(out.error).toBe('Falha na geração');
  });
});