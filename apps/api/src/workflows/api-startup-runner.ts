import { InMemoryCheckpointStore } from '../services/stateMachine/checkpoint-store.js';
import { WorkflowEngine } from '../services/stateMachine/workflow.engine.js';
import { apiStartupWorkflow } from './api-startup.workflow.js';
import { getApiState, isCritical } from '../lib/api-state.js';

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
    // Se o workflow falhou criticamente, o handleCriticalFailure já fez setTimeout(exit)
    // Aguardamos o término natural
    if (isCritical()) {
      await new Promise(() => {}); // bloqueia até o process.exit no handleCriticalFailure
    }
    throw err;
  }
}

export function getStartupState(): Readonly<ReturnType<typeof getApiState>> {
  return getApiState();
}