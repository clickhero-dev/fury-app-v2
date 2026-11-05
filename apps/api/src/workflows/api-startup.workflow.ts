import type { WorkflowDefinition } from '../services/stateMachine/stageInterface.js';
import { RetryDependencyError, WorkflowFailedError } from '../services/stateMachine/workflow.engine.js';
import { db } from '@fury/db';
import { sql } from 'drizzle-orm';
import { waitForRedisReady } from '../lib/redis.js';
import { runMigrationsAndValidate } from '@fury/db/migrate';
import { setCheck, setStatus, handleCriticalFailure, getMissingEnvs } from '../lib/api-state.js';

export interface ApiStartupContext {
  startedAt: string;
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
        const start = Date.now();
        await db.execute(sql`SELECT 1`);
        const latencyMs = Date.now() - start;
        setCheck('db', true, `latency ${latencyMs}ms`);
        return { ok: true, latencyMs };
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
    setStatus('healthy');
    return { planId: undefined };
  },
};