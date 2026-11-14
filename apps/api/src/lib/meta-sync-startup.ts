import { setCheck } from './api-state.js';
import { startMetaSyncManager } from './meta-sync-manager.js';
import { startSyncJobsWorker } from './sync-jobs.js';

function observedStarter(name: string, code: string, start: () => Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let stopped = false;
  let running = false;
  let delay = 30_000;

  const attempt = (): Promise<void> => {
    if (stopped || running) return Promise.resolve();
    if (pending) return pending;
    if (timer) { clearTimeout(timer); timer = undefined; }
    pending = (async () => {
      try {
        await start();
        if (!stopped) { running = true; delay = 30_000; setCheck(name, true); }
      } catch {
        if (!stopped) {
          console.error(`[${name}] ${code}`);
          setCheck(name, false, code);
          timer = setTimeout(() => { timer = undefined; void attempt(); }, delay);
          timer.unref();
          delay = Math.min(delay * 2, 300_000);
        }
      }
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return {
    start: attempt,
    stop: async () => { stopped = true; if (timer) clearTimeout(timer); await pending; },
  };
}

const manager = observedStarter('meta-sync', 'META_SYNC_START_FAILED', startMetaSyncManager);
const initial = observedStarter('meta-initial-sync', 'META_INITIAL_SYNC_START_FAILED', startSyncJobsWorker);
export const startObservedMetaSyncManager = manager.start;
export const startObservedInitialSyncWorker = initial.start;
export async function stopObservedMetaSyncWorkers(): Promise<void> {
  await Promise.all([manager.stop(), initial.stop()]);
}
