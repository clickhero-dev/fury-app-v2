export const IMAGE_GENERATION_ESTIMATE_MS = 120_000;
export const IMAGE_GENERATION_PROGRESS_CAP = 95;

/** Presentation-only progress. Only a successful API response may reach 100%. */
export function getEstimatedImageGenerationProgress(elapsedMs: number): number {
  const safeElapsedMs = Math.max(0, elapsedMs);
  return Math.min(IMAGE_GENERATION_PROGRESS_CAP, (safeElapsedMs / IMAGE_GENERATION_ESTIMATE_MS) * IMAGE_GENERATION_PROGRESS_CAP);
}

export function getMonotonicImageGenerationProgress(previous: number, elapsedMs: number): number {
  return Math.max(previous, getEstimatedImageGenerationProgress(elapsedMs));
}
