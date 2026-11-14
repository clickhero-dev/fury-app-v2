import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ manager: vi.fn(), initial: vi.fn() }));
vi.mock('../lib/meta-sync-manager.js', () => ({ startMetaSyncManager: mocks.manager }));
vi.mock('../lib/sync-jobs.js', () => ({ startSyncJobsWorker: mocks.initial }));
import { getApiState, setStatus } from '../lib/api-state.js';
import { startObservedMetaSyncManager, startObservedInitialSyncWorker } from '../lib/meta-sync-startup.js';

describe('Inicialização observável da sincronização Meta', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); setStatus('healthy'); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([
    ['meta-sync', 'META_SYNC_START_FAILED', mocks.manager, startObservedMetaSyncManager],
    ['meta-initial-sync', 'META_INITIAL_SYNC_START_FAILED', mocks.initial, startObservedInitialSyncWorker],
  ])('Dado %s indisponível, quando inicia e recupera, registra saúde sem reiniciar a API', async (name, code, start, observed) => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    start.mockRejectedValueOnce(new Error('redis://user:secret@example'));
    await observed();
    expect(getApiState().checks[name]).toMatchObject({ ok: false, detail: code });
    expect(getApiState().status).toBe('healthy');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(exit).not.toHaveBeenCalled();
    start.mockResolvedValueOnce(undefined);
    await observed();
    expect(getApiState().checks[name]).toMatchObject({ ok: true });
  });
});
