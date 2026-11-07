/**
 * Funcionalidade: criação atômica de tenant pelo superadmin
 * Cenário: tenant e usuário são criados na mesma transação
 *   Dado um payload válido
 *   Quando o repository executa o setup
 *   Então retorna os dois registros criados
 * Cenário: corrida em constraint conhecida
 *   Dado que outra requisição venceu a corrida
 *   Quando o insert falha com 23505
 *   Então o resultado identifica somente o recurso em conflito
 * Cenário: falha desconhecida
 *   Dado um erro de infraestrutura sem constraint conhecida
 *   Quando o setup falha
 *   Então o erro original permanece observável para o handler
 */
import { describe, expect, it, vi } from 'vitest';
import { SuperAdminRepository } from '../repository/superadmin.repository.js';

const input = {
  name: 'Cliente novo',
  slug: 'cliente-novo',
  userName: 'Owner',
  userEmail: 'Owner@Example.com',
  passwordHash: 'hashed-password',
  userRole: 'owner' as const,
};

function makeDb({ transaction }: { transaction: (fn: (tx: any) => Promise<unknown>) => Promise<unknown> }) {
  return {
    transaction,
    query: {
      tenants: { findFirst: vi.fn(async () => null) },
      users: { findFirst: vi.fn(async () => null) },
    },
  } as any;
}

function txForCreatedRows() {
  let insertCount = 0;
  const values = vi.fn(() => ({ returning: vi.fn(async () => {
    insertCount += 1;
    return insertCount === 1 ? [{ id: 'tenant-1', name: input.name, slug: input.slug }] : [{ id: insertCount === 2 ? 'user-1' : 'subscription-1', tenantId: 'tenant-1', email: input.userEmail }];
  }) }));
  return {
    values,
    query: { plans: { findFirst: vi.fn().mockResolvedValue({ id: 'trial-plan', technicalKey: 'public_trial_signup', priceCents: 0, isActive: true, limits: { creativesPerMonth: 5 } }) }, subscriptions: { findFirst: vi.fn().mockResolvedValue(null) } },
    insert: vi.fn(() => ({ values })),
  };
}

describe('SuperAdminRepository.createTenantWithUser', () => {
  it('Cenário: cria tenant e usuário no mesmo commit', async () => {
    const tx = txForCreatedRows();
    const transaction = vi.fn(async (fn) => fn(tx));
    const repo = new SuperAdminRepository('', makeDb({ transaction }));

    const result = await repo.createTenantWithUser(input);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(tx.query.plans.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', planId: 'trial-plan', status: 'trial', creativesRemaining: 5, trialEndsAt: expect.any(Date) }));
    expect(result.status).toBe('created');
    expect(result.tenant.id).toBe('tenant-1');
    expect(result.user.id).toBe('user-1');
  });

  it('não conclui o setup se o plano trial estiver ausente', async () => {
    const tx = txForCreatedRows();
    tx.query.plans.findFirst.mockResolvedValue(null);
    const repo = new SuperAdminRepository('', makeDb({ transaction: vi.fn(async (fn) => fn(tx)) }));
    await expect(repo.createTenantWithUser(input)).rejects.toMatchObject({ code: 'INVALID_TRIAL_PLAN' });
    expect(tx.insert).toHaveBeenCalledTimes(2);
  });

  it('Cenário: converte corrida de slug em conflito sem vazar dados', async () => {
    const error = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'tenants_slug_unique',
    });
    const db = makeDb({ transaction: vi.fn(async () => { throw error; }) });
    db.query.tenants.findFirst.mockResolvedValue({ id: 'secret-tenant', slug: input.slug });
    const repo = new SuperAdminRepository('', db);

    const result = await repo.createTenantWithUser(input);

    expect(result).toEqual({ status: 'conflict', code: 'SLUG_EXISTS' });
    expect(result).not.toHaveProperty('tenant');
  });

  it('Cenário: propaga constraint desconhecida para virar erro inesperado', async () => {
    const error = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'unrelated_unique_key',
    });
    const repo = new SuperAdminRepository('', makeDb({ transaction: vi.fn(async () => { throw error; }) }));

    await expect(repo.createTenantWithUser(input)).rejects.toBe(error);
  });
});
