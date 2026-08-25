import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY as string | undefined;

export const analyticsEnabled = Boolean(POSTHOG_API_KEY);

const client = analyticsEnabled
  ? new PostHog(POSTHOG_API_KEY as string)
  : null;

/**
 * Captura uma exceção no PostHog (error tracking server-side).
 * Não envia campos sensíveis (tokens, secrets, bodies).
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

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  client.captureException(
    err instanceof Error ? err : new Error(message),
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
