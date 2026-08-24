export type StageStatus = 'PENDING' | 'RUNNING' | 'COMMITTED' | 'FAILED' | 'COMPLETED';

export type WorkflowStatus = 'pending' | 'running' | 'done' | 'error';

export type ArtifactMap = Record<string, unknown>;

export type BackoffType = 'fixed' | 'exponential';

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffType?: BackoffType;
}

export interface StageEvent {
  stageId: string;
  status: StageStatus;
  attempts: number;
  pct: number;
  error?: string;
}

export interface StageTrace {
  stageId: string;
  status: StageStatus;
  attempts: number;
  error?: string;
  startedAt: string;
  committedAt?: string;
}

export interface WorkflowSnapshot {
  id: string;
  tenantId: string;
  workflow: string;
  status: WorkflowStatus;
  lockKey: string;
  currentStage: string | null;
  stages: StageTrace[];
  artifacts: ArtifactMap;
  planId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgressCallback = (event: StageEvent) => void;

export type ReconciliationMode = 'rollback' | 'manual';