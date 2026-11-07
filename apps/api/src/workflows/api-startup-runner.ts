import { InMemoryCheckpointStore } from '../services/stateMachine/checkpoint-store.js';
import { WorkflowEngine, WorkflowFailedError } from '../services/stateMachine/workflow.engine.js';
import { apiStartupWorkflow } from './api-startup.workflow.js';
import { getApiState, handleCriticalFailure } from '../lib/api-state.js';

const JOB_ID = 'api-startup-global';

export async function runApiStartupWorkflow(): Promise<void> {
  const store = new InMemoryCheckpointStore();
  const engine = new WorkflowEngine(apiStartupWorkflow, store);

  await store.create({
    id: JOB_ID,
    tenantId: 'system',
    workflow: 'api-startup',
    lockKey: 'global',
  });

  try {
    await engine.run(JOB_ID, { startedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof WorkflowFailedError && err.stageId === 'db-connect') {
      handleCriticalFailure('Database startup probe failed after retries');
    }
    // O processo ainda será finalizado pelo supervisor, mas devolvemos o erro
    // imediatamente para que o chamador possa fechar o listener HTTP e não
    // deixe uma porta servindo respostas durante a janela de encerramento.
    throw err;
  }
}

export function getStartupState(): Readonly<ReturnType<typeof getApiState>> {
  return getApiState();
}
