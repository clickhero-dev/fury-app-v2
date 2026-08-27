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