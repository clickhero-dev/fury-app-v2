import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ start: vi.fn(), check: vi.fn(), status: vi.fn() }));
vi.mock('../lib/meta-sync-manager.js', () => ({ startMetaSyncManager: mocks.start }));
vi.mock('../lib/api-state.js', () => ({ setCheck: mocks.check, setStatus: mocks.status }));
import { startObservedMetaSyncManager } from '../lib/meta-sync-startup.js';

describe('Inicialização observável da sincronização Meta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Dado o worker disponível, quando inicia, então registra sucesso', async () => {
    mocks.start.mockResolvedValueOnce(undefined);
    await startObservedMetaSyncManager();
    expect(mocks.check).toHaveBeenLastCalledWith('meta-sync', true);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('Dado o Redis indisponível, quando inicia, então degrada o health sem expor o erro', async () => {
    mocks.start.mockRejectedValueOnce(new Error('redis://user:secret@example'));
    await startObservedMetaSyncManager();
    expect(mocks.check).toHaveBeenLastCalledWith('meta-sync', false, 'META_SYNC_START_FAILED');
    expect(mocks.status).toHaveBeenCalledWith('degraded');
  });
});
