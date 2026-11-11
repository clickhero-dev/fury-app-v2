import { setCheck, setStatus } from './api-state.js';
import { startMetaSyncManager } from './meta-sync-manager.js';

/** Report startup failure and let the existing degraded watchdog restart the process. */
export async function startObservedMetaSyncManager(): Promise<void> {
  try {
    await startMetaSyncManager();
    setCheck('meta-sync', true);
  } catch {
    console.error('[meta-sync] META_SYNC_START_FAILED');
    setCheck('meta-sync', false, 'META_SYNC_START_FAILED');
    setStatus('degraded');
  }
}
