import { WorkflowJobRepository } from '../../repository/workflow-job.repository.js';
import type { CheckpointStore } from './checkpoint-store.js';
import type { ArtifactMap, StageTrace, WorkflowSnapshot, WorkflowStatus } from './types.js';

interface WorkflowJobRow {
  id: string;
  tenantId: string;
  workflow: string;
  status: string;
  lockKey: string;
  currentStage: string | null;
  stages: StageTrace[] | null;
  artifacts: ArtifactMap | null;
  planId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSnapshot(row: WorkflowJobRow): WorkflowSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    workflow: row.workflow,
    status: row.status as WorkflowStatus,
    lockKey: row.lockKey,
    currentStage: row.currentStage,
    stages: row.stages ?? [],
    artifacts: row.artifacts ?? {},
    planId: row.planId ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Implementação Postgres (drizzle) do CheckpointStore.
 * Cada transição de stage persiste estado + checkpoints de forma atômica,
 * garantindo que a recuperação retome sempre a partir de um estado confiável.
 */
export class PostgresCheckpointStore implements CheckpointStore {
  async create(input: { id: string; tenantId: string; workflow: string; lockKey: string }): Promise<void> {
    await new WorkflowJobRepository('').createWorkflowJob({
      id: input.id,
      tenantId: input.tenantId,
      workflow: input.workflow,
      lockKey: input.lockKey,
      status: 'pending',
    });
  }

  async load(jobId: string): Promise<WorkflowSnapshot | null> {
    const row = await new WorkflowJobRepository('').getWorkflowJob(jobId);
    if (!row) return null;
    return toSnapshot(row as unknown as WorkflowJobRow);
  }

  async save(jobId: string, patch: {
    status?: WorkflowStatus;
    currentStage?: string | null;
    stages?: StageTrace[];
    artifacts?: ArtifactMap;
    planId?: string;
    error?: string;
  }): Promise<void> {
    await new WorkflowJobRepository('').patchWorkflowJob(jobId, {
      status: patch.status,
      currentStage: patch.currentStage ?? null,
      stages: patch.stages ?? undefined,
      artifacts: patch.artifacts ?? undefined,
      planId: patch.planId ?? null,
      error: patch.error ?? null,
      updatedAt: new Date(),
    });
  }

  async markFailed(jobId: string, stageId: string, error: string): Promise<void> {
    await this.save(jobId, { status: 'error', currentStage: stageId, error });
  }

  async markDone(jobId: string, planId: string): Promise<void> {
    await this.save(jobId, { status: 'done', planId, currentStage: null, error: undefined });
  }

  async listRecoverable(opts?: { workflow?: string; sinceMs?: number }): Promise<WorkflowSnapshot[]> {
    const rows = await new WorkflowJobRepository('').listRecoverableWorkflowJobs(opts);
    return (rows as unknown as WorkflowJobRow[]).map(toSnapshot);
  }

  async findActiveByLockKey(lockKey: string, workflow: string): Promise<WorkflowSnapshot | null> {
    const row = await new WorkflowJobRepository('').findActiveWorkflowJobByLockKey(lockKey, workflow);
    if (!row) return null;
    return toSnapshot(row as unknown as WorkflowJobRow);
  }

  async findByPlanId(planId: string): Promise<WorkflowSnapshot | null> {
    const row = await new WorkflowJobRepository('').findWorkflowJobByPlanId(planId);
    if (!row) return null;
    return toSnapshot(row as unknown as WorkflowJobRow);
  }

  async renewLock(jobId: string): Promise<void> {
    await new WorkflowJobRepository('').renewWorkflowJobLock(jobId);
  }
}