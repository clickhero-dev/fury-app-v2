import { PostgresCheckpointStore } from './services/stateMachine/postgres-checkpoint-store.js';
import { WorkflowEngine } from './services/stateMachine/workflow.engine.js';
import { registerWorkflow, getWorkflow } from './services/stateMachine/workflow-registry.js';
import { plannerWorkflow, type PlannerWorkflowInput } from './agents/orchestrator.js';

export const plannerStore = new PostgresCheckpointStore();

registerWorkflow(plannerWorkflow);

function getPlannerEngine(): WorkflowEngine<PlannerWorkflowInput> {
  const definition = getWorkflow(plannerWorkflow.id) as typeof plannerWorkflow;
  return new WorkflowEngine(definition, plannerStore);
}

/** Executa (ou retoma) o workflow do planejador para um job. */
export async function runPlannerWorkflow(jobId: string, tenantId: string): Promise<void> {
  const engine = getPlannerEngine();
  const snapshot = await plannerStore.load(jobId);
  const resume = !!(snapshot && snapshot.status === 'running' && snapshot.stages.length > 0);
  await engine.run(jobId, { tenantId, currentDate: new Date().toISOString() }, { resume });
}

/** Recupera jobs interrompidos (crash/restart) — chamado no boot do servidor. */
export async function recoverInterruptedPlannerWorkflows(): Promise<number> {
  const engine = getPlannerEngine();
  const recoverable = await engine.listRecoverable({
    workflow: plannerWorkflow.id,
    sinceMs: 30_000, // ignora jobs criados nos últimos 30s (ainda podem estar rodando)
  });

  let resumed = 0;
  for (const snapshot of recoverable) {
    console.log(`[planner-recovery] retomando job ${snapshot.id} do stage ${snapshot.currentStage ?? 'início'}`);
    void runPlannerWorkflow(snapshot.id, snapshot.tenantId).catch((err) => {
      console.error(`[planner-recovery] job ${snapshot.id} falhou ao retomar:`, err);
    });
    resumed += 1;
  }
  return resumed;
}