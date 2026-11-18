import { afterEach, describe, expect, it, vi } from 'vitest';
import { withOutcomeDeadline } from '../services/core/chat-outcome-deadline.js';

afterEach(() => vi.useRealTimers());
describe('Prazo do journal de efeitos', () => {
  it('permite gravação confirmada sem aguardar o prazo inteiro', async () => {
    await expect(withOutcomeDeadline(Promise.resolve(true), 10)).resolves.toBe(true);
  });
  it('não deixa persistência travada prender a resposta para sempre', async () => {
    vi.useFakeTimers();
    const pending = withOutcomeDeadline(new Promise<boolean>(() => undefined), 50);
    const assertion = expect(pending).rejects.toThrow('Resultado ainda não confirmado.');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propaga falha e libera timer', async () => {
    vi.useFakeTimers();
    await expect(withOutcomeDeadline(Promise.reject(new Error('private')), 50)).rejects.toThrow('private');
    expect(vi.getTimerCount()).toBe(0);
  });
});
