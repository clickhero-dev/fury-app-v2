import { setCheck } from './api-state.js';
import { startMetaSyncManager } from './meta-sync-manager.js';
import { startSyncJobsWorker } from './sync-jobs.js';

async function observeStartup(name: string, code: string, start: () => Promise<void>): Promise<void> {
  try {
    await start();
    setCheck(name, true);
  } catch {
    console.error(`[${name}] ${code}`);
    setCheck(name, false, code);
  }
}

export function startObservedMetaSyncManager(): Promise<void> {
  return observeStartup('meta-sync', 'META_SYNC_START_FAILED', startMetaSyncManager);
}

export function startObservedInitialSyncWorker(): Promise<void> {
  return observeStartup('meta-initial-sync', 'META_INITIAL_SYNC_START_FAILED', startSyncJobsWorker);
}
