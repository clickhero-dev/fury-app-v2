export const GENERATION_ESTIMATE_DURATION_MS = 120_000;
export const MAX_ESTIMATED_GENERATION_PROGRESS = 95;

export type GenerationProgressPhase = 'generating' | 'completing' | 'complete' | 'error' | 'cancelled';

export type GenerationProgressState = {
  phase: GenerationProgressPhase;
  progress: number;
  startedAt: number;
};

export function getEstimatedGenerationProgress(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  return Math.min(
    MAX_ESTIMATED_GENERATION_PROGRESS,
    Math.floor((elapsed / GENERATION_ESTIMATE_DURATION_MS) * MAX_ESTIMATED_GENERATION_PROGRESS),
  );
}

export function startGeneration(startedAt: number): GenerationProgressState {
  return { phase: 'generating', progress: 0, startedAt };
}

export function tickGeneration(state: GenerationProgressState, now: number): GenerationProgressState {
  if (state.phase !== 'generating' || now < state.startedAt) return state;

  return {
    ...state,
    progress: Math.max(state.progress, getEstimatedGenerationProgress(now - state.startedAt)),
  };
}

export function completeGeneration(state: GenerationProgressState): GenerationProgressState {
  if (state.phase !== 'generating') return state;

  return {
    ...state,
    phase: 'completing',
    progress: Math.max(state.progress, MAX_ESTIMATED_GENERATION_PROGRESS),
  };
}

export function failGeneration(state: GenerationProgressState, phase: 'error' | 'cancelled' = 'error'): GenerationProgressState {
  return { ...state, phase };
}
