import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findPartnerAccount } = vi.hoisted(() => ({ findPartnerAccount: vi.fn() }));
vi.mock('../repository/partner.repository.js', () => ({
  PartnerRepository: class { findPartnerAccount = findPartnerAccount; },
}));

import { BillingService } from '../services/billing/billing.service.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
// repositório de assinatura que nunca deveria ser usado quando a checagem barra
const repo = { findTenant: vi.fn(async () => ({ partnerId: null })), listActivePlans: vi.fn(async () => [{ id: 'ady-plan' }]) };
const service = () => new BillingService(() => repo as never);
const payload = { planId: TENANT, billingType: 'PIX' as const, customerName: 'Teste', customerEmail: 't@t.com', customerCpfCnpj: '12345678909' };

describe('Cobrança na conta do parceiro (unidade)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('conta do parceiro: sem planos da ady e assinatura recusada sem citar parceiro', async () => {
    findPartnerAccount.mockResolvedValue({ partnerId: 'p1', partnerName: 'X', planName: null });
    expect(await service().listActivePlans(TENANT)).toEqual([]);
    await expect(service().subscribe(TENANT, payload)).rejects.toMatchObject({ statusCode: 403, code: 'PARTNER_MANAGED' });
    await expect(service().subscribe(TENANT, payload)).rejects.not.toMatchObject({ message: expect.stringMatching(/parceiro/i) });
    expect(repo.listActivePlans).not.toHaveBeenCalled();
  });

  it('falha ao verificar a conta: recusa com motivo (na dúvida, não mostra preços nem assina)', async () => {
    findPartnerAccount.mockImplementation(async () => { throw new Error('db down'); });
    await expect(service().listActivePlans(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'ACCOUNT_CHECK_FAILED' });
    await expect(service().subscribe(TENANT, payload)).rejects.toMatchObject({ statusCode: 503, code: 'ACCOUNT_CHECK_FAILED' });
    expect(repo.listActivePlans).not.toHaveBeenCalled();
  });

  it('cliente ady: segue normal', async () => {
    findPartnerAccount.mockResolvedValue(null);
    expect(await service().listActivePlans(TENANT)).toEqual([{ id: 'ady-plan' }]);
  });
});
