import { describe, it, expect, vi } from 'vitest';
import { SuperAdminRepository } from '../repository/superadmin.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'x', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: 'new', ...v }] }) }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const select = vi.fn(() => ({
    from: (t: any) => ({
      where: async () => [{ total: '3' }],
      leftJoin: () => ({
        where: (w: any) => {
          const result: any[] = [{ total: '3' }];
          (result as any).orderBy = () => ({
            limit: () => ({ offset: async () => [{ id: 'u', tenantName: 'T' }] }),
          });
          return result;
        },
      }),
      groupBy: async () => [{ planId: 'p', count: 2 }],
    }),
  }));
  const db: any = {
    query: {
      tenants: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      users: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      plans: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      subscriptions: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      brandKits: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      clientGoals: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      furyConfig: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      campaigns: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      creativeAssets: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update, insert, delete: del, select,
  };
  return { db, update, insert, del, select };
}

describe('SuperAdminRepository (GLOBAL)', () => {
  it('listTenants consulta todos os tenants', async () => {
    const { db } = makeDb();
    const repo = new SuperAdminRepository('', db);
    await repo.listTenants();
    expect(db.query.tenants.findMany).toHaveBeenCalledTimes(1);
  });

  it('createTenant insere e retorna', async () => {
    const { db, insert } = makeDb();
    const repo = new SuperAdminRepository('', db);
    const t = await repo.createTenant({ name: 'X', slug: 'x' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(t.name).toBe('X');
  });

  it('countUsersByTenant usa select count', async () => {
    const { db } = makeDb();
    const repo = new SuperAdminRepository('', db);
    const n = await repo.countUsersByTenant('t-1');
    expect(n).toBe(3);
  });

  it('listSubscriberCountsByPlan faz group-by', async () => {
    const { db } = makeDb();
    const repo = new SuperAdminRepository('', db);
    const rows = await repo.listSubscriberCountsByPlan();
    expect(rows[0].count).toBe(2);
  });

  it('paginateUsersAdmin retorna rows e total', async () => {
    const { db } = makeDb();
    const repo = new SuperAdminRepository('', db);
    const res = await repo.paginateUsersAdmin('', 10, 0);
    expect(res.total).toBe(3);
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it('findClientGoalByTenant consulta goals por tenant', async () => {
    const { db } = makeDb();
    const repo = new SuperAdminRepository('', db);
    await repo.findClientGoalByTenant('t-1');
    expect(db.query.clientGoals.findFirst).toHaveBeenCalledTimes(1);
  });

  it('updatePlan usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new SuperAdminRepository('', db);
    await repo.updatePlan('p-1', { name: 'N' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});