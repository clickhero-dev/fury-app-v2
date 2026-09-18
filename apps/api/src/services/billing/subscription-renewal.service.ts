import { SubscriptionRepository } from '../../repository/subscription.repository.js';

/**
 * Job de renovação mensal de créditos e planos (card 86e3akhxr).
 *
 * Regras (confirmadas com o Diogo):
 * - Renova TODAS as assinaturas ativas vencidas (status active,
 *   is_non_expirable false, current_period_end <= now).
 * - Avança current_period_end +1 mês E reseta creatives_remaining ao teto do
 *   plano (plans.limits.creativesPerMonth) — inclusive assinaturas cuja cota
 *   atual é null (sem limite): renovam assinatura e cota também.
 * - Sem e-mail (card não pede).
 * - Independente de pagamento (não há integração com gateway).
 */

/** Projeção mínima que o service precisa de cada assinatura vencida. */
export interface RenewalSubscription {
  id: string;
  planId: string;
  currentPeriodEnd: Date | null;
}

/** Porta (ADR-0001) — o repository real implementa estes 3 métodos. */
export interface SubscriptionRenewalRepo {
  listSubscriptionsDueForRenewal(now: Date): Promise<RenewalSubscription[]>;
  getPlanCreativesLimit(planId: string): Promise<number | null>;
  renewSubscription(id: string, nextPeriodEnd: Date, creativesLimit: number | null): Promise<void>;
}

export interface RenewalResult {
  renewed: number;
  skipped: number;
}

/**
 * Soma `months` a uma data preservando o dia do mês; em fim de mês, clampa
 * para o último dia válido (ex.: 31 jan + 1 mês → 28/29 fev).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    // overflow (ex.: 31 jan → 3 mar): volta para o último dia do mês alvo
    result.setDate(0);
  }
  return result;
}

export class SubscriptionRenewalService {
  constructor(private readonly repo: SubscriptionRenewalRepo = new SubscriptionRepository('')) {}

  /** Renova todas as assinaturas vencidas. Erro por linha é isolado (skip). */
  async renewAllDue(now: Date = new Date()): Promise<RenewalResult> {
    const due = await this.repo.listSubscriptionsDueForRenewal(now);

    let renewed = 0;
    let skipped = 0;

    for (const sub of due) {
      try {
        const creativesLimit = await this.repo.getPlanCreativesLimit(sub.planId);
        const nextPeriodEnd = addMonths(sub.currentPeriodEnd ?? now, 1);
        await this.repo.renewSubscription(sub.id, nextPeriodEnd, creativesLimit);
        renewed++;
      } catch (error) {
        skipped++;
        console.error(
          `[SUBSCRIPTION-RENEWAL] falha ao renovar assinatura ${sub.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { renewed, skipped };
  }
}
