import { SubscriptionRenewalService } from '../services/billing/subscription-renewal.service.js';

/**
 * Agendador do job de renovação mensal de créditos e planos (card 86e3akhxr).
 *
 * - Roda uma vez ao iniciar a API.
 * - Repete a cada 2h (redundância proposital — renovações já aplicadas não
 *   são reprocessadas porque current_period_end avança +1 mês).
 * - setInterval, não BullMQ (padrão compliance-sweeper; sem retry/isolamento
 *   necessário). Nunca derruba o processo: erro é logado e o ciclo segue.
 */

const RENEWAL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h

let timer: NodeJS.Timeout | null = null;

async function runRenewal(service: SubscriptionRenewalService): Promise<void> {
  try {
    const { renewed, skipped } = await service.renewAllDue();
    if (renewed > 0 || skipped > 0) {
      console.log(`[SUBSCRIPTION-RENEWAL] renovadas=${renewed} puladas=${skipped}`);
    }
  } catch (error) {
    console.error(
      '[SUBSCRIPTION-RENEWAL] erro no ciclo:',
      error instanceof Error ? error.message : error,
    );
  }
}

export function startSubscriptionRenewalManager(
  service: SubscriptionRenewalService = new SubscriptionRenewalService(),
  intervalMs: number = RENEWAL_INTERVAL_MS,
): void {
  if (timer) return; // idempotente

  void runRenewal(service); // roda ao iniciar a API

  timer = setInterval(() => {
    void runRenewal(service);
  }, intervalMs);
  timer.unref?.();
}

export function stopSubscriptionRenewalManager(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
