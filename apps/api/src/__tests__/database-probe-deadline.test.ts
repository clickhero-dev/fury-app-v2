import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDatabaseProbe } from '../lib/database-probe.js';

describe('probe de banco com prazo', () => {
  afterEach(() => vi.useRealTimers());

  it('Cenário: consulta concluída libera o timer sem cancelar', async () => {
    const cancel = vi.fn();
    const query = Object.assign(Promise.resolve(), { cancel });
    await expect(runDatabaseProbe(() => query)).resolves.toBeUndefined();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('Cenário: consulta pendurada é cancelada e classificada como timeout', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn().mockResolvedValue(undefined);
    const query = Object.assign(new Promise<void>(() => {}), { cancel });
    const result = runDatabaseProbe(() => query);
    const assertion = expect(result).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
