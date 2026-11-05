import type { RetryPolicy } from './types.js';

export interface ResolvedRetryPolicy extends RetryPolicy {}

/** Calcula o delay a aguardar antes da próxima tentativa do stage. */
export function nextRetryDelayMs(attempt: number, policy: ResolvedRetryPolicy): number {
  const { backoffMs, backoffType = 'fixed' } = policy;
  if (backoffType === 'exponential') {
    return backoffMs * 2 ** (attempt - 1);
  }
  return backoffMs;
}

/** Aguarda o delay calculado para a tentativa atual (1-indexed). */
export async function sleepBackoff(attempt: number, policy: ResolvedRetryPolicy): Promise<void> {
  const delay = nextRetryDelayMs(attempt, policy);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Valida se ainda há tentativas restantes para o stage. */
export function hasAttemptsRemaining(attempt: number, policy: ResolvedRetryPolicy): boolean {
  return attempt < policy.maxAttempts;
}

/** Obtém a política efetiva (stage > default). */
export function resolveRetryPolicy(stagePolicy?: RetryPolicy, defaultPolicy?: RetryPolicy): ResolvedRetryPolicy {
  return {
    maxAttempts: stagePolicy?.maxAttempts ?? defaultPolicy?.maxAttempts ?? 1,
    backoffMs: stagePolicy?.backoffMs ?? defaultPolicy?.backoffMs ?? 0,
    backoffType: stagePolicy?.backoffType ?? defaultPolicy?.backoffType ?? 'fixed',
  };
}