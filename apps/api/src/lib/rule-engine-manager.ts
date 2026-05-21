import { Worker } from 'bullmq';
import { createRuleEngineQueue, RULE_ENGINE_QUEUE_NAME, type RuleEngineJobPayload } from './queue.js';
import { startRuleEngineWorker } from '../workers/rule-engine.worker.js';

let worker: Worker<RuleEngineJobPayload> | null = null;

export async function startRuleEngine(): Promise<void> {
  try {
    // createRuleEngineQueue agora é assíncrona e já obtém a conexão singleton
    const queue = await createRuleEngineQueue();

    // Inicia o worker (deve usar a mesma conexão – ajuste o worker se necessário)
    worker = await startRuleEngineWorker();

    // Adiciona job recorrente (a cada 30 minutos)
    await queue.add('process-rules', { timestamp: new Date().toISOString() }, {
      repeat: { pattern: '*/30 * * * *' },
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