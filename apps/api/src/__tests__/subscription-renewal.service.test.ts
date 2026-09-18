import { describe, it, expect, vi } from 'vitest';
import {
  SubscriptionRenewalService,
  addMonths,
  type SubscriptionRenewalRepo,
} from '../services/billing/subscription-renewal.service.js';

/**
 * Job de renovação mensal (card 86e3akhxr): renova, para TODAS as assinaturas
 * ativas vencidas, o tempo de plano (current_period_end +1 mês) E a cota
 * (creatives_remaining = teto do plano). Decisão Diogo: assinaturas com cota
 * null NÃO são ignoradas — renovam assinatura e cota também.
 */

function makeRepo(overrides: Partial<SubscriptionRenewalRepo> = {}) {
  return {
    listSubscriptionsDueForRenewal: vi.fn().mockResolvedValue([]),
    getPlanCreativesLimit: vi.fn().mockResolvedValue(10),
    renewSubscription: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SubscriptionRenewalRepo;
}

describe('addMonths', () => {
  it('soma 1 mês preservando o dia', () => {
    expect(addMonths(new Date(2026, 8, 15), 1)).toEqual(new Date(2026, 9, 15));
  });

  it('vira o ano', () => {
    expect(addMonths(new Date(2026, 11, 15), 1)).toEqual(new Date(2027, 0, 15));
  });

  it('clampa fim de mês (31 jan → 28 fev)', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
  });
});

describe('SubscriptionRenewalService.renewAllDue', () => {
  it('renova cada vencida: avança período +1 mês e reseta cota ao teto do plano', async () => {
    const due = [{ id: 's1', planId: 'p1', currentPeriodEnd: new Date(2026, 7, 10) }];
    const repo = makeRepo({
      listSubscriptionsDueForRenewal: vi.fn().mockResolvedValue(due),
      getPlanCreativesLimit: vi.fn().mockResolvedValue(12),
    });
    const service = new SubscriptionRenewalService(repo);

    const result = await service.renewAllDue(new Date(2026, 7, 20));

    expect(result).toEqual({ renewed: 1, skipped: 0 });
    expect(repo.renewSubscription).toHaveBeenCalledWith('s1', new Date(2026, 8, 10), 12);
  });

  it('plano sem teto → reseta cota para null (sem limite)', async () => {
    const due = [{ id: 's1', planId: 'p1', currentPeriodEnd: new Date(2026, 7, 10) }];
    const repo = makeRepo({
      listSubscriptionsDueForRenewal: vi.fn().mockResolvedValue(due),
      getPlanCreativesLimit: vi.fn().mockResolvedValue(null),
    });
    const service = new SubscriptionRenewalService(repo);

    const result = await service.renewAllDue(new Date(2026, 7, 20));

    expect(repo.renewSubscription).toHaveBeenCalledWith('s1', expect.any(Date), null);
    expect(result.renewed).toBe(1);
  });

  it('erro numa assinatura não derruba as demais (skip + continua)', async () => {
    const due = [
      { id: 's1', planId: 'p1', currentPeriodEnd: new Date(2026, 7, 10) },
      { id: 's2', planId: 'p2', currentPeriodEnd: new Date(2026, 7, 11) },
    ];
    const renew = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);
    const repo = makeRepo({
      listSubscriptionsDueForRenewal: vi.fn().mockResolvedValue(due),
      getPlanCreativesLimit: vi.fn().mockResolvedValue(5),
      renewSubscription: renew,
    });
    const service = new SubscriptionRenewalService(repo);

    const result = await service.renewAllDue(new Date(2026, 7, 20));

    expect(result).toEqual({ renewed: 1, skipped: 1 });
    expect(renew).toHaveBeenCalledTimes(2);
  });

  it('sem vencidas → { renewed: 0, skipped: 0 } e não tenta renovar nada', async () => {
    const repo = makeRepo();
    const service = new SubscriptionRenewalService(repo);

    expect(await service.renewAllDue(new Date())).toEqual({ renewed: 0, skipped: 0 });
    expect(repo.renewSubscription).not.toHaveBeenCalled();
  });
});
