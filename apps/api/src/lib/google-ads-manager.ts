import { Worker, Queue } from 'bullmq';
import { getRedisConnection } from './queue.js';
import { startGoogleAdsWorker, stopGoogleAdsWorker } from '../workers/google-ads.worker.js';

let worker: Worker | null = null;

export async function startGoogleAdsManager(): Promise<void> {
  const connection = await getRedisConnection();
  worker = await startGoogleAdsWorker();

  const queue = new Queue('google-ads', { connection });
  await queue.add('google-ads:tick', { timestamp: new Date().toISOString() }, {
    // 1x/dia à meia-noite — preserva quota da Google Ads API (chamadas têm custo).
    repeat: { pattern: '0 0 * * *' },
  });

  console.log('✅ Google-ads scheduler started (runs daily at midnight)');
}

export async function stopGoogleAdsManager(): Promise<void> {
  await stopGoogleAdsWorker();
  worker = null;
  console.log('🛑 Google-ads worker stopped');
}