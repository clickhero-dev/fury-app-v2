import type { ProgressCallback, StageEvent } from './types.js';

/**
 * Repassa eventos de progresso do engine para consumidores.
 * O adapter de domínio (ex.: planner) converte StageEvent → JobStatus.
 */
export type { ProgressCallback, StageEvent };

export function createProgressReporter(onEvent?: ProgressCallback): ProgressCallback {
  return (event: StageEvent) => {
    if (onEvent) onEvent(event);
  };
}

/** Acumula eventos em uma lista (útil p/ testes e logging). */
export function collectEvents(): { callback: ProgressCallback; events: StageEvent[] } {
  const events: StageEvent[] = [];
  const callback: ProgressCallback = (event) => events.push(event);
  return { callback, events };
}