import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY as string | undefined;

export const analyticsEnabled = Boolean(POSTHOG_API_KEY);

const client = analyticsEnabled
  ? new PostHog(POSTHOG_API_KEY as string)
  : null;

/**
 * Redige segredos comuns de textos de erro antes da telemetria:
 * `access_token=` em URLs e tokens de acesso Meta/Instagram (EAA…/IGAA…).
 */
export function redactSensitiveText(input: string): string {
  return input
    .replace(/(access_token=)[^&\s"'`]+/gi, '$1[REDACTED]')
    .replace(/(?:EAA|IGAA)[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
}

/**
 * Captura uma exceção no PostHog (error tracking server-side).
 * Não envia campos sensíveis (tokens, secrets, bodies) — mensagem e stack
 * passam por redactSensitiveText.
 */
export function captureServerException(
  err: unknown,
  context: {
    tenantId?: string | null;
    method?: string;
    path?: string;
    statusCode?: number;
    code?: string;
  } = {}
) {
  if (!client) return;

  const message = redactSensitiveText(err instanceof Error ? err.message : String(err));
  const stack = err instanceof Error ? redactSensitiveText(err.stack ?? '') : undefined;

  client.captureException(
    new Error(message),
    context.tenantId ?? 'server',
    {
      source: 'server',
      method: context.method,
      path: context.path,
      statusCode: context.statusCode,
      errorCode: context.code,
      stack,
    }
  );
}

/** Captura eventos custom server-side. */
export function captureServerEvent(event: string, properties: Record<string, unknown> = {}) {
  if (!client) return;
  client.capture({
    distinctId: String(properties.tenantId ?? 'server'),
    event,
    properties,
  });
}

/** Descarrega eventos pendentes (usado no encerramento gracioso). */
export async function flushAnalytics(): Promise<void> {
  if (!client) return;
  await client.flush();
}
