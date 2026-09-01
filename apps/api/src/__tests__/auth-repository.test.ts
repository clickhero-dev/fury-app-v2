import { describe, it, expect, vi } from 'vitest';
import { AuthRepository } from '../repository/auth.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'u-1', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: 'new', ...v }] }) }));
  const db: any = {
    query: {
      users: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      tenants: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update, insert, delete: vi.fn(() => ({ where: async () => {} })),
  };
  return { db, update, insert };
}

describe('AuthRepository', () => {
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