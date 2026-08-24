import { and, eq, lt, desc, or } from 'drizzle-orm';
import { db, workflowJobs } from '@fury/db';
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
    await db.insert(workflowJobs).values({
      id: input.id,
      tenantId: input.tenantId,
      workflow: input.workflow,
      lockKey: input.lockKey,
      status: 'pending',
    });
  }

  async load(jobId: string): Promise<WorkflowSnapshot | null> {
    const row = await db.query.workflowJobs.findFirst({
      where: eq(workflowJobs.id, jobId),
    });
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
    await db.update(workflowJobs)
      .set({
        status: patch.status,
        currentStage: patch.currentStage ?? null,
        stages: patch.stages ?? undefined,
        artifacts: patch.artifacts ?? undefined,
        planId: patch.planId ?? null,
        error: patch.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(workflowJobs.id, jobId));
  }

  async markFailed(jobId: string, stageId: string, error: string): Promise<void> {
    await this.save(jobId, { status: 'error', currentStage: stageId, error });
  }

  async markDone(jobId: string, planId: string): Promise<void> {
    await this.save(jobId, { status: 'done', planId, currentStage: null, error: undefined });
  }

  async listRecoverable(opts?: { workflow?: string; sinceMs?: number }): Promise<WorkflowSnapshot[]> {
    const cutoff = opts?.sinceMs ? new Date(Date.now() - opts.sinceMs) : new Date(0);
    const conditions = [
      or(eq(workflowJobs.status, 'running'), eq(workflowJobs.status, 'pending')),
      lt(workflowJobs.updatedAt, cutoff),
    ];
    if (opts?.workflow) conditions.push(eq(workflowJobs.workflow, opts.workflow));

    const rows = await db.query.workflowJobs.findMany({
      where: and(...conditions),
      orderBy: [desc(workflowJobs.createdAt)],
    });

    return (rows as unknown as WorkflowJobRow[]).map(toSnapshot);
  }

  async findActiveByLockKey(lockKey: string, workflow: string): Promise<WorkflowSnapshot | null> {
    const row = await db.query.workflowJobs.findFirst({
      where: and(
        eq(workflowJobs.lockKey, lockKey),
        eq(workflowJobs.workflow, workflow),
        or(eq(workflowJobs.status, 'running'), eq(workflowJobs.status, 'pending')),
      ),
    });
    if (!row) return null;
    return toSnapshot(row as unknown as WorkflowJobRow);
  }
}