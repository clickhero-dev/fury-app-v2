import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeDatabase } from '../lib/database-probe.js';

afterEach(() => vi.useRealTimers());

describe('deadline do probe do banco', () => {
  it('cancela a consulta pendente e informa timeout após dez segundos', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const query = Object.assign(new Promise<unknown>(() => {}), { cancel });
    const result = probeDatabase(() => query);
    const assertion = expect(result).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('propaga erros do banco sem cancelar uma consulta já concluída', async () => {
    const cancel = vi.fn();
    const failure = Object.assign(new Error('offline'), { code: 'ECONNREFUSED' });
    const query = Object.assign(Promise.reject(failure), { cancel });
    await expect(probeDatabase(() => query)).rejects.toBe(failure);
    expect(cancel).not.toHaveBeenCalled();
  });
});
