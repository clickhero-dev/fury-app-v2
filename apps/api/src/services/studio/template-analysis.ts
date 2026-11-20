import { analyticsEnvironment, captureServerEvent } from '../../lib/analytics.js';
import { AppError } from '../../middleware/errorHandler.js';
import { parseTemplatePlan, TEMPLATE_ANALYSIS_MODEL } from './template-prompt.js';

type AnalysisRequest = { model: string; text: string; imageUrls: string[]; temperature: number; jsonMode: boolean };
type AnalysisResponse = { content: string; costUsd: number | null };

/** Retry only the analysis, never generation. All telemetry fields are finite metadata. */
export async function analyzeTemplate(
  call: (options: AnalysisRequest) => Promise<AnalysisResponse>,
  options: Pick<AnalysisRequest, 'text' | 'imageUrls'>,
  emit = captureServerEvent,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 250)),
) {
  let failureReason = 'none';
  for (let attempts = 1; attempts <= 2; attempts++) {
    try {
      const result = await call({ ...options, model: TEMPLATE_ANALYSIS_MODEL, temperature: 0.1, jsonMode: true });
      const plan = parseTemplatePlan(result.content);
      record(attempts === 1 ? 'success' : 'recovered', attempts);
      return { plan, costUsd: result.costUsd };
    } catch (error) {
      const invalid = error instanceof AppError && error.code === 'TEMPLATE_ANALYSIS_INVALID';
      failureReason = invalid ? String(error.details?.reason) :
        error instanceof AppError && error.code === 'OPENROUTER_CHAT_TIMEOUT' ? 'timeout' :
        error instanceof AppError && error.code === 'OPENROUTER_CHAT_NETWORK' ? 'network' : 'provider_error';
      const transient = error instanceof AppError &&
        ['OPENROUTER_CHAT_ERROR', 'OPENROUTER_CHAT_TIMEOUT', 'OPENROUTER_CHAT_NETWORK'].includes(error.code) &&
        error.details?.retryable === true;
      if (transient && attempts < 2) { await pause(); continue; }
      record('failed', attempts);
      if (invalid || (error instanceof AppError && error.code === 'OPENROUTER_INSUFFICIENT_CREDITS')) throw error;
      throw new AppError(502, 'TEMPLATE_ANALYSIS_UNAVAILABLE',
        'O serviço de análise está indisponível. Tente novamente em instantes. Sua cota foi devolvida.');
    }
  }
  throw new Error('Unreachable template analysis state');

  function record(outcome: string, attempts: number) {
    // Analytics must never affect generation or trigger another provider call.
    try {
      emit('studio_template_analysis', {
        model: TEMPLATE_ANALYSIS_MODEL,
        environment: analyticsEnvironment(),
        outcome, attempts, failureReason,
      });
    } catch { /* best effort telemetry */ }
  }
}
