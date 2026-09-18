import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  startSubscriptionRenewalManager,
  stopSubscriptionRenewalManager,
} from '../lib/subscription-renewal-manager.js';

/**
 * Agendador do job de renovação (card 86e3akhxr): roda ao iniciar + a cada 2h,
 * idempotente e com stop que cancela o intervalo.
 */

function makeService(renewed = 0, skipped = 0) {
  return {
    renewAllDue: vi.fn().mockResolvedValue({ renewed, skipped }),
  } as unknown as Parameters<typeof startSubscriptionRenewalManager>[0];
}

describe('subscription-renewal-manager', () => {
  afterEach(() => {
    stopSubscriptionRenewalManager();
    vi.useRealTimers();
  });

  it('roda uma vez ao iniciar e repete no intervalo de 2h', async () => {
    vi.useFakeTimers();
    const service = makeService(2, 0);

    startSubscriptionRenewalManager(service, 7_200_000);
    expect(service.renewAllDue).toHaveBeenCalledTimes(1); // run inicial síncrono

    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(service.renewAllDue).toHaveBeenCalledTimes(2);
  });

  it('stop() cancela o intervalo — não roda mais', async () => {
    vi.useFakeTimers();
    const service = makeService(0, 0);

    startSubscriptionRenewalManager(service, 1_000);
    expect(service.renewAllDue).toHaveBeenCalledTimes(1);

    stopSubscriptionRenewalManager();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(service.renewAllDue).toHaveBeenCalledTimes(1);
  });

  it('não agenda em duplicidade (idempotente)', () => {
    vi.useFakeTimers();
    const service = makeService(0, 0);

    startSubscriptionRenewalManager(service, 1_000);
    startSubscriptionRenewalManager(service, 1_000);

    expect(service.renewAllDue).toHaveBeenCalledTimes(1); // só 1 run inicial
  });

  it('erro no serviço não derruba o ciclo (não lança)', async () => {
    vi.useFakeTimers();
    const service = {
      renewAllDue: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Parameters<typeof startSubscriptionRenewalManager>[0];

    expect(() => startSubscriptionRenewalManager(service, 1_000)).not.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);
    // o erro foi capturado internamente (logado), sem propagar
  });
});
