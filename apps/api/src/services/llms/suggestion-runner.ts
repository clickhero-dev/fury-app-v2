import { AppError } from '../../middleware/errorHandler.js';
import type { ChatMessage } from './openrouter.service.js';
import { captureServerEvent } from '../../lib/analytics.js';
import { analyticsEnvironment, requestContext } from '../../lib/request-context.js';

/** Only controlled metadata crosses the provider boundary. */
export class SuggestionProviderError extends AppError {
  constructor(public readonly kind: 'http' | 'timeout' | 'network', public readonly upstreamStatus?: number) {
    super(502, 'OPENROUTER_CHAT_ERROR', 'Falha ao gerar o texto. Tente novamente.');
  }
}
type Client = { chat(messages: ChatMessage[], options: { model: string; max_tokens: number; timeoutMs: number; response_format: { type: 'json_object' } }): Promise<string> };

export async function runSuggestion<T>(client: Client, messages: ChatMessage[], models: string[], parse: (raw: string) => T | null): Promise<T | null> {
  for (const [index, model] of models.slice(0, 2).entries()) {
    const started = Date.now();
    let outcome = 'invalid_response';
    let upstreamStatus: number | undefined;
    let retryable = false;
    try {
      const value = parse(await client.chat(messages, { model, max_tokens: 1024, timeoutMs: 20_000, response_format: { type: 'json_object' } }));
      if (value !== null) { outcome = 'success'; return value; }
    } catch (error) {
      if (error instanceof SuggestionProviderError) {
        outcome = error.kind;
        upstreamStatus = error.upstreamStatus;
        retryable = error.kind !== 'http' || upstreamStatus === 429 || (upstreamStatus !== undefined && upstreamStatus >= 500);
        if (!retryable) return null;
      } else {
        // Unknown failures may be configuration/auth errors: do not repeat them.
        outcome = 'unknown_error';
        return null;
      }
    } finally {
      const context = requestContext.getStore();
      captureServerEvent('suggestion_attempt', { ...context, endpoint: context?.path, environment: analyticsEnvironment(), provider: 'openrouter', model, attempt: index + 1, outcome, upstreamStatus, durationMs: Date.now() - started });
    }
    if (retryable && index === 0 && models.length > 1) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}
