export type ApiHealth = 'starting' | 'healthy' | 'degraded' | 'critical';

export interface ApiCheck {
  ok: boolean;
  detail?: string;
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

export function setCheck(name: string, ok: boolean, detail?: string): void {
  state = {
    ...state,
    checks: {
      ...state.checks,
      [name]: { ok, detail, at: new Date().toISOString() },
    },
  };
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

export function getMissingEnvs(): string[] {
  return REQUIRED_ENVS.filter((k) => !process.env[k]);
}