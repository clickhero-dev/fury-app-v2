import type { WorkflowSnapshot } from '../services/stateMachine/types.js';
import type { AgentStep, JobStatus } from '../agents/types.js';

/** Mapeia stageId → nome de agente exibido no frontend. */
export const STAGE_TO_AGENT: Record<string, string> = {
  prerequisites: 'Prerequisites Agent',
  context: 'Context Agent',
  planner: 'Planner Agent',
  'image-generation': 'Image Generation Agent',
  save: 'Salvar plano',
};

export const STAGE_ORDER = [
  'prerequisites',
  'context',
  'planner',
  'image-generation',
  'save',
];

/** Converte um snapshot do workflow em JobStatus (contrato do frontend). */
export function snapshotToJobStatus(snapshot: WorkflowSnapshot): JobStatus {
  const steps: AgentStep[] = STAGE_ORDER.map((stageId) => {
    const trace = snapshot.stages.find((t) => t.stageId === stageId);
    const status = !trace
      ? ('pending' as const)
      : trace.status === 'COMMITTED'
        ? ('completed' as const)
        : trace.status === 'FAILED'
          ? ('failed' as const)
          : trace.status === 'RUNNING'
            ? ('running' as const)
            : ('pending' as const);

    return {
      name: STAGE_TO_AGENT[stageId] ?? stageId,
      status,
      pct: status === 'completed' ? 100 : status === 'running' ? 50 : 0,
    };
  });

  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    status: snapshot.status === 'awaiting_images' ? 'generating' : snapshot.status,
    currentAgent: STAGE_TO_AGENT[snapshot.currentStage ?? ''] ?? 'Pipeline',
    agentProgress: steps,
    planId: snapshot.planId,
    error: snapshot.error,
    _recoverable: snapshot.stages.some((t) => t.status === 'COMMITTED'),
  };
}