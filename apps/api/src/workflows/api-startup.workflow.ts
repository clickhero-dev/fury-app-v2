import type { WorkflowDefinition } from '../services/stateMachine/stageInterface.js';
import { RetryDependencyError, WorkflowFailedError } from '../services/stateMachine/workflow.engine.js';
import { createDatabaseProbe } from '@fury/db';
import { runDatabaseProbe } from '../lib/database-probe.js';
import { waitForRedisReady } from '../lib/redis.js';
import { runMigrationsAndValidate } from '@fury/db/migrate';
import { setCheck, setStatus, handleCriticalFailure, getMissingEnvs, databaseCheckErrorDetail, classifyDatabaseError } from '../lib/api-state.js';
import { captureServerEvent } from '../lib/analytics.js';

export interface ApiStartupContext {
  startedAt: string;
}

let dbAttempt = 0;
let dbHadFailure = false;

function safeCapture(event: string, properties: Record<string, unknown>): void {
  try { captureServerEvent(event, properties); } catch { /* telemetria não controla readiness */ }
}

function runtimeEnvironment(): 'production' | 'development' | 'test' | 'unknown' {
  const value = process.env.NODE_ENV;
  return value === 'production' || value === 'development' || value === 'test' ? value : 'unknown';
}

export const apiStartupWorkflow: WorkflowDefinition<ApiStartupContext> = {
  id: 'api-startup',
  lockKey: () => 'global',
  defaultRetry: { maxAttempts: 3, backoffMs: 2_000, backoffType: 'fixed' },
  stages: [
    {
      id: 'db-connect',
      artifactKey: 'dbStatus',
      retryPolicy: { maxAttempts: 3, backoffMs: 2_000, backoffType: 'fixed' },
      execute: async (_ctx, _artifacts) => {
        dbAttempt += 1;
        const start = Date.now();
        try {
          await runDatabaseProbe(createDatabaseProbe);
          const latencyMs = Date.now() - start;
          setCheck('db', true, `latency ${latencyMs}ms`);
          if (dbHadFailure) {
            safeCapture('db_health_probe_recovered', {
              service: 'api',
              environment: runtimeEnvironment(),
              category: 'healthy',
              attempt: dbAttempt,
              latency_ms: latencyMs,
            });
            dbHadFailure = false;
          }
          return { ok: true, latencyMs };
        } catch (error) {
          const category = classifyDatabaseError(error);
          dbHadFailure = true;
          setCheck('db', false, databaseCheckErrorDetail(error), category);
          safeCapture('db_health_probe_failed', {
            service: 'api',
            environment: runtimeEnvironment(),
            category,
            attempt: dbAttempt,
            latency_ms: Date.now() - start,
          });
          // O alvo atual é ES2020, cujo tipo de Error ainda não aceita `cause`
          // no construtor. A causa é preservada para diagnóstico interno sem
          // deixar a mensagem crua chegar ao motor de workflow.
          const sanitizedError = new Error(databaseCheckErrorDetail(error));
          (sanitizedError as Error & { cause?: unknown }).cause = error;
          throw sanitizedError;
        }
      },
    },
    {
      id: 'migrate',
      deps: ['db-connect'],
      artifactKey: 'migrateStatus',
      retryPolicy: { maxAttempts: 3, backoffMs: 5_000, backoffType: 'fixed' },
      execute: async (_ctx, _artifacts) => {
        try {
          await runMigrationsAndValidate();
          setCheck('migrate', true, 'all 26 tables exist');
          return { ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setCheck('migrate', false, msg);
          handleCriticalFailure(`Migration validation failed: ${msg}`);
          throw new WorkflowFailedError('api-startup-global', 'migrate', msg);
        }
      },
    },
    {
      id: 'redis-connect',
      artifactKey: 'redisStatus',
      retryPolicy: { maxAttempts: 3, backoffMs: 2_000, backoffType: 'exponential' },
      execute: async (_ctx, _artifacts) => {
        const start = Date.now();
        await waitForRedisReady();
        const latencyMs = Date.now() - start;
        setCheck('redis', true, `latency ${latencyMs}ms`);
        return { ok: true, latencyMs };
      },
    },
    {
      id: 'env-validate',
      artifactKey: 'envStatus',
      retryPolicy: { maxAttempts: 1, backoffMs: 0, backoffType: 'fixed' },
      execute: async (_ctx, _artifacts) => {
        const missing = getMissingEnvs();
        if (missing.length === 0) {
          setCheck('env', true, 'all required env vars present');
          return { ok: true, missing: [] };
        }

        setCheck('env', false, `missing: ${missing.join(', ')}`);
        setStatus('degraded');
        throw new RetryDependencyError('env-validate', `Missing required env vars: ${missing.join(', ')}`);
      },
    },
  ],
  finalize: (_ctx, artifacts) => {
    const envArtifact = artifacts.envStatus as { missing: string[] } | undefined;
    if (envArtifact?.missing?.length) {
      // Mantém degraded — o loop de log/restart já foi iniciado no stage
      return { planId: undefined };
    }
    return { planId: undefined };
  },
};
