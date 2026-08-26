import type { ArtifactMap, StageTrace, WorkflowSnapshot, WorkflowStatus } from './types.js';

/**
 * Contrato de persistência de estado e checkpoints de um workflow.
 * Desacoplado do banco — qualquer implementação (Postgres, Redis, in-memory
 * para testes) pode ser injetada no WorkflowEngine.
 */
export interface CheckpointStore {
  create(input: {
    id: string;
    tenantId: string;
    workflow: string;
    lockKey: string;
  }): Promise<void>;

  load(jobId: string): Promise<WorkflowSnapshot | null>;

  /** Persiste o estado completo após uma transição de stage (transação atômica). */
  save(jobId: string, patch: {
    status?: WorkflowStatus;
    currentStage?: string | null;
    stages?: StageTrace[];
    artifacts?: ArtifactMap;
    planId?: string;
    error?: string;
  }): Promise<void>;

  markFailed(jobId: string, stageId: string, error: string): Promise<void>;
  markDone(jobId: string, planId: string): Promise<void>;

  /** Lista jobs passíveis de recuperação (running/pending antigos ou error recuperável). */
  listRecoverable(opts?: { workflow?: string; sinceMs?: number }): Promise<WorkflowSnapshot[]>;

  /** Busca job ativo (running/pending) por lock key — usado para lock de concorrência. */
  findActiveByLockKey(lockKey: string, workflow: string): Promise<WorkflowSnapshot | null>;

  /** Busca job por planId — usado para completar job quando todas as imagens terminam. */
  findByPlanId(planId: string): Promise<WorkflowSnapshot | null>;

  /** Renova o timestamp updatedAt do job (heartbeat) para evitar expiração por stale timeout. */
  renewLock(jobId: string): Promise<void>;
}

/** Implementação de referência em memória — útil para testes unitários. */
export class InMemoryCheckpointStore implements CheckpointStore {
  private rows = new Map<string, WorkflowSnapshot>();

  async create(input: { id: string; tenantId: string; workflow: string; lockKey: string }): Promise<void> {
    const now = new Date().toISOString();
    this.rows.set(input.id, {
      id: input.id,
      tenantId: input.tenantId,
      workflow: input.workflow,
      lockKey: input.lockKey,
      status: 'pending',
      currentStage: null,
      stages: [],
      artifacts: {},
      createdAt: now,
      updatedAt: now,
    });
  }

  async load(jobId: string): Promise<WorkflowSnapshot | null> {
    const row = this.rows.get(jobId);
    return row ? structuredClone(row) : null;
  }

  async save(jobId: string, patch: {
    status?: WorkflowStatus;
    currentStage?: string | null;
    stages?: StageTrace[];
    artifacts?: ArtifactMap;
    planId?: string;
    error?: string;
  }): Promise<void> {
    const row = this.rows.get(jobId);
    if (!row) return;
    Object.assign(row, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async markFailed(jobId: string, stageId: string, error: string): Promise<void> {
    await this.save(jobId, { status: 'error', currentStage: stageId, error });
  }

  async markDone(jobId: string, planId: string): Promise<void> {
    await this.save(jobId, { status: 'done', planId, currentStage: null, error: undefined });
  }

  async listRecoverable(opts?: { workflow?: string; sinceMs?: number }): Promise<WorkflowSnapshot[]> {
    const cutoff = opts?.sinceMs ? new Date(Date.now() - opts.sinceMs).toISOString() : null;
    return Array.from(this.rows.values()).filter((r) => {
      if (r.status !== 'running' && r.status !== 'pending') return false;
      if (opts?.workflow && r.workflow !== opts.workflow) return false;
      if (cutoff && r.updatedAt >= cutoff) return false;
      return true;
    });
  }

  async findActiveByLockKey(lockKey: string, workflow: string): Promise<WorkflowSnapshot | null> {
    const row = Array.from(this.rows.values()).find(
      (r) => r.lockKey === lockKey && r.workflow === workflow && (r.status === 'running' || r.status === 'pending'),
    );
    return row ? structuredClone(row) : null;
  }

  async findByPlanId(planId: string): Promise<WorkflowSnapshot | null> {
    const row = Array.from(this.rows.values())
      .filter((r) => r.planId === planId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return row ? structuredClone(row) : null;
  }

  async renewLock(jobId: string): Promise<void> {
    const row = this.rows.get(jobId);
    if (row) {
      row.updatedAt = new Date().toISOString();
    }
  }
}