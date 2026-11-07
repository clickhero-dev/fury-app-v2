import { describe, it, expect, vi } from 'vitest';
import { AuthRepository } from '../repository/auth.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'u-1', ...s }] }) }) }));
  const insertValues = vi.fn((v: any) => ({ returning: async () => [{ id: 'new', ...v }] }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const db: any = {
    query: {
      users: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      tenants: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      plans: { findFirst: vi.fn(async () => ({ id: 'plan-trial', name: 'Trial', isActive: true, priceCents: 0, features: { trialDays: 7, images: 5, revisionsPerImage: 3, videos: false }, limits: { creativesPerMonth: 5, modificationsPerCreative: 3, videosPerMonth: 0 } })) },
    },
    update, insert, delete: vi.fn(() => ({ where: async () => {} })),
  };
  return { db, update, insert, insertValues };
}

describe('AuthRepository', () => {
  /*
   * Funcionalidade: trial automático para novas contas
   * Cenário: provisionar acesso limitado por sete dias
   * Dado um plano Trial ativo, quando uma conta nova é provisionada,
   * então recebe cinco imagens, três revisões e sete dias de trial.
   */
  it('provisiona assinatura Trial com 5 imagens e validade de 7 dias', async () => {
    const { db, insert, insertValues } = makeDb();
    const repo = new AuthRepository('tenant-1', db);
    const now = new Date('2026-11-06T12:00:00.000Z');

    await repo.provisionDefaultTrial(now);

    expect(db.query.plans.findFirst).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    const subscription = insertValues.mock.calls[0]![0];
    expect(subscription).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      planId: 'plan-trial',
      status: 'trial',
      creativesRemaining: 5,
      trialEndsAt: new Date('2026-11-13T12:00:00.000Z'),
    }));
  });

  it('falha explicitamente se o plano Trial não estiver configurado', async () => {
    const { db, insert } = makeDb();
    db.query.plans.findFirst.mockResolvedValueOnce(null);
    const repo = new AuthRepository('tenant-1', db);

    await expect(repo.provisionDefaultTrial()).rejects.toThrow(/plano Trial/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it('findUserByEmail consulta users por email (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new AuthRepository('', db);
    await repo.findUserByEmail('a@b.com');
    expect(db.query.users.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findUserByGoogleId consulta por googleId (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new AuthRepository('', db);
    await repo.findUserByGoogleId('g-1');
    expect(db.query.users.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findUserByFacebookId consulta por facebookId (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new AuthRepository('', db);
    await repo.findUserByFacebookId('fb-1');
    expect(db.query.users.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findTenantBySlug consulta tenants por slug (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new AuthRepository('', db);
    await repo.findTenantBySlug('empresa');
    expect(db.query.tenants.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findTenantSlugConflict acha conflito por slug em outro tenant (exclui o próprio)', async () => {
    const { db } = makeDb();
    db.query.tenants.findFirst.mockResolvedValueOnce({ id: 't-2', slug: 'fury' });
    const repo = new AuthRepository('', db);
    const found = await repo.findTenantSlugConflict('fury', 't-1');
    expect(found?.id).toBe('t-2');
    // a busca deve excluir o próprio tenant (and com ne)
    const [{ where }] = db.query.tenants.findFirst.mock.calls[0];
    expect(where).toBeDefined();
  });

  it('findTenantSlugConflict acha conflito por slugify(name) quando a coluna slug diverge', async () => {
    const { db } = makeDb();
    // coluna não conflita; nomes sim (slugify "petróleo" → "petroleo")
    db.query.tenants.findFirst.mockResolvedValueOnce(null);
    db.query.tenants.findMany.mockResolvedValueOnce([
      { id: 't-1', name: 'Petroleo' }, // próprio tenant — deve ser ignorado
      { id: 't-2', name: 'Petróleo' }, // conflita via slugify(name) NFD
    ]);
    const repo = new AuthRepository('', db);
    const found = await repo.findTenantSlugConflict('petroleo', 't-1');
    expect(found?.id).toBe('t-2');
  });

  it('findTenantSlugConflict retorna null quando o slug está livre', async () => {
    const { db } = makeDb();
    db.query.tenants.findFirst.mockResolvedValueOnce(null);
    db.query.tenants.findMany.mockResolvedValueOnce([
      { id: 't-1', name: 'Outra' },
      { id: 't-2', name: 'Diferente' },
    ]);
    const repo = new AuthRepository('', db);
    const found = await repo.findTenantSlugConflict('livre', 't-1');
    expect(found).toBeNull();
  });

  it('createTenant insere e retorna tenant', async () => {
    const { db, insert } = makeDb();
    const repo = new AuthRepository('', db);
    const tenant = await repo.createTenant({ name: 'X', slug: 'x' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(tenant.name).toBe('X');
  });

  it('patchUser usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new AuthRepository('', db);
    await repo.patchUser('u-1', { name: 'N' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('createUser insere usuário', async () => {
    const { db, insert } = makeDb();
    const repo = new AuthRepository('', db);
    const user = await repo.createUser({ email: 'a@b.com' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(user.email).toBe('a@b.com');
  });
});