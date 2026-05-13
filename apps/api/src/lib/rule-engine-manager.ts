import { Worker } from 'bullmq';
import { createBullConnection, createRuleEngineQueue, type RuleEngineJobPayload } from './queue.js';
import { startRuleEngineWorker } from '../workers/rule-engine.worker.js';

let worker: Worker<RuleEngineJobPayload> | null = null;

export async function startRuleEngine(): Promise<void> {
  try {
    const connection = await createBullConnection();
    const queue = createRuleEngineQueue(connection);

    worker = await startRuleEngineWorker();

    await queue.add('process-rules', { timestamp: new Date().toISOString() }, {
      repeat: {
        pattern: '*/30 * * * *',
      },
    });

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
