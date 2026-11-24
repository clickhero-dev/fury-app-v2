import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), initial: vi.fn() }));
vi.mock('../lib/meta-sync-manager.js', () => ({ startMetaSyncManager: mocks.manager }));
vi.mock('../lib/sync-jobs.js', () => ({ startSyncJobsWorker: mocks.initial }));
let getApiState: typeof import('../lib/api-state.js').getApiState;
let startObservedMetaSyncManager: typeof import('../lib/meta-sync-startup.js').startObservedMetaSyncManager;
let stopObservedMetaSyncWorkers: typeof import('../lib/meta-sync-startup.js').stopObservedMetaSyncWorkers;

describe('Retomada dos workers Meta', () => {
  beforeEach(async () => { vi.resetModules(); vi.useFakeTimers(); vi.resetAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); ({ startObservedMetaSyncManager, stopObservedMetaSyncWorkers } = await import('../lib/meta-sync-startup.js')); ({ getApiState } = await import('../lib/api-state.js')); });
  afterEach(async () => { await stopObservedMetaSyncWorkers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('Dado Redis indisponível, quando recupera, retoma uma única vez e atualiza o health', async () => {
    mocks.manager.mockRejectedValueOnce(new Error('secret')).mockResolvedValue(undefined);
    await startObservedMetaSyncManager();
    expect(getApiState().checks['meta-sync'].ok).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.manager).toHaveBeenCalledTimes(2);
    expect(getApiState().checks['meta-sync'].ok).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.manager).toHaveBeenCalledTimes(2);
  });

  it('Dada falha persistente, quando encerra, cancela novas tentativas', async () => {
    mocks.manager.mockRejectedValue(new Error('secret'));
    await startObservedMetaSyncManager();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.manager).toHaveBeenCalledTimes(2);
    await stopObservedMetaSyncWorkers();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.manager).toHaveBeenCalledTimes(2);
  });
});
