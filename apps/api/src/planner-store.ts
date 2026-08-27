import { PostgresCheckpointStore } from './services/stateMachine/postgres-checkpoint-store.js';

/**
 * Store dos jobs do planejador (tabela `workflow_jobs`). Isolado em módulo
 * próprio para que o worker de imagem (studio) e o worker do planner possam
 * coordenar a conclusão do job sem criar ciclo de import.
 */
export const plannerStore = new PostgresCheckpointStore();