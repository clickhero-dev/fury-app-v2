import type { WorkflowDefinition } from './stageInterface.js';

/**
 * Registro global de workflows. Qualquer novo fluxo (campanhas, publicação,
 * etc.) registra sua WorkflowDefinition aqui para que workers e recuperação
 * encontrem o engine correto pelo id persistido em workflow_jobs.workflow.
 */
const registry = new Map<string, WorkflowDefinition<unknown>>();

export function registerWorkflow<TCtx>(definition: WorkflowDefinition<TCtx>): WorkflowDefinition<TCtx> {
  registry.set(definition.id, definition as WorkflowDefinition<unknown>);
  return definition;
}

export function getWorkflow(id: string): WorkflowDefinition<unknown> | undefined {
  return registry.get(id);
}

export function listWorkflows(): WorkflowDefinition<unknown>[] {
  return Array.from(registry.values());
}