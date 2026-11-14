export type ApiHealth = 'starting' | 'healthy' | 'degraded' | 'critical';

export interface ApiCheck {
  ok: boolean;
  detail?: string;
  category?: 'unavailable' | 'timeout' | 'query_error' | 'unknown';
  at: string;
}

export interface ApiState {
  status: ApiHealth;
  checks: Record<string, ApiCheck>;
  startedAt: string;
  healthyAt?: string;
}

const REQUIRED_ENVS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'TOKEN_ENCRYPTION_KEY',
];

const DEGRADED_LOG_INTERVAL_MS = 5_000;
const DEGRADED_RESTART_AFTER_MS = 60_000;
const CRITICAL_EXIT_DELAY_MS = 10_000;

let state: ApiState = {
  status: 'starting',
  checks: {},
  startedAt: new Date().toISOString(),
};

let degradedTimer: ReturnType<typeof setInterval> | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

function clearDegradedTimers(): void {
  if (degradedTimer) {
    clearInterval(degradedTimer);
    degradedTimer = null;
  }
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function startDegradedLoop(): void {
  clearDegradedTimers();

  degradedTimer = setInterval(() => {
    const missing = REQUIRED_ENVS.filter((k) => !process.env[k]);
    console.warn(`[api-state] DEGRADED — missing env vars: ${missing.join(', ')}`);
  }, DEGRADED_LOG_INTERVAL_MS);

  restartTimer = setTimeout(() => {
    console.error('[api-state] DEGRADED timeout — restarting process');
    process.exit(1);
  }, DEGRADED_RESTART_AFTER_MS);
}

export function handleCriticalFailure(reason: string): void {
  console.error(`[api-state] CRITICAL — ${reason} — exiting in ${CRITICAL_EXIT_DELAY_MS}ms`);
  state = { ...state, status: 'critical' };
  setTimeout(() => process.exit(1), CRITICAL_EXIT_DELAY_MS);
}

export function getApiState(): Readonly<ApiState> {
  return state;
}

export function setCheck(
  name: string,
  ok: boolean,
  detail?: string,
  category?: ApiCheck['category'],
): void {
  state = {
    ...state,
    checks: {
      ...state.checks,
      [name]: {
        ok,
        detail,
        ...(category ? { category } : {}),
        at: new Date().toISOString(),
      },
    },
  };
}

export type DatabaseFailureCategory = NonNullable<ApiCheck['category']>;

const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'CONNECTION_CLOSED',
]);

const TIMEOUT_CODES = new Set(['CONNECT_TIMEOUT', 'ETIMEDOUT', '57014']);

/** Classifica erros do driver sem depender de mensagens que podem conter segredos. */
export function classifyDatabaseError(error: unknown): DatabaseFailureCategory {
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (typeof current !== 'object') return 'unknown';
    if (visited.has(current)) return 'unknown';
    visited.add(current);

    const code = String((current as { code?: unknown }).code ?? '').toUpperCase();
    if (TIMEOUT_CODES.has(code)) return 'timeout';
    if (UNAVAILABLE_CODES.has(code) || code.startsWith('08')) return 'unavailable';
    if (/^(?:[0-9]{2}|P0|XX|HV|F0)[0-9A-Z]{3}$/.test(code)) return 'query_error';
    current = (current as { cause?: unknown }).cause;
  }

  return 'unknown';
}

/**
 * Retorna apenas um diagnóstico útil para operação, sem repetir a mensagem do
 * driver (que pode conter URL, usuário, senha ou outros dados de conexão).
 */
export function databaseCheckErrorDetail(error: unknown): string {
  return `database connection failed (${classifyDatabaseError(error)})`;
}

export function setStatus(status: ApiHealth): void {
  state = { ...state, status };
  if (status === 'healthy') {
    state.healthyAt = new Date().toISOString();
    clearDegradedTimers();
  } else if (status === 'degraded') {
    startDegradedLoop();
  } else if (status === 'critical') {
    clearDegradedTimers();
  }
}

export function isHealthy(): boolean {
  return state.status === 'healthy';
}

export function isCritical(): boolean {
  return state.status === 'critical';
}

export function isDegraded(): boolean {
  return state.status === 'degraded';
}

export function isReady(): boolean {
  return state.status === 'healthy';
}

export function getMissingEnvs(): string[] {
  return REQUIRED_ENVS.filter((k) => !process.env[k]);
}
