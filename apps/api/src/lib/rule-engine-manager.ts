import { Worker } from 'bullmq';
import { createRuleEngineQueue, RULE_ENGINE_QUEUE_NAME, type RuleEngineJobPayload } from './queue.js';
import { startRuleEngineWorker } from '../workers/rule-engine.worker.js';
import { replaceLegacyRepeatablesWithScheduler } from './job-scheduler.js';

let worker: Worker<RuleEngineJobPayload> | null = null;

export async function startRuleEngine(): Promise<void> {
  try {
    // createRuleEngineQueue agora é assíncrona e já obtém a conexão singleton
    const queue = await createRuleEngineQueue();

    // Inicia o worker (deve usar a mesma conexão – ajuste o worker se necessário)
    worker = await startRuleEngineWorker();

    await replaceLegacyRepeatablesWithScheduler(
      queue,
      ['process-rules'],
      ['rule-engine-every-30-minutes'],
      'cron-ady-rule-engine-process-rules-every-30m',
      { pattern: '*/30 * * * *' },
      {
        name: 'cron-ady-rule-engine-process-rules',
        data: { timestamp: new Date().toISOString() },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
      },
    );

    console.log('✅ Rule engine scheduler started (runs every 30 minutes)');
  } catch (error) {
    console.error('Failed to start rule engine:', error);
    throw error;
  }
}

export async function stopRuleEngine(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('🛑 Rule engine worker stopped');
  }
}
