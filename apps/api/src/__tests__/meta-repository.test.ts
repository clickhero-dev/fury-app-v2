import { describe, it, expect, vi } from 'vitest';
import { MetaRepository } from '../repository/meta.repository.js';

/** Testes unitários do MetaRepository — injeta `db` mockado no construtor. */

function mockRow(overrides: Record<string, any> = {}) {
  return { id: 'conn-1', tenantId: 'tenant-1', metaUserId: 'm-1', accessToken: 'tok', adAccounts: [], createdAt: new Date(), ...overrides };
}

function makeDb() {
  const update = vi.fn(() => ({
    set: (setData: any) => ({ where: (where: any) => ({ returning: async () => [mockRow({ ...setData })] }) }),
  }));
  const insert = vi.fn(() => ({
    values: (values: any) => ({ returning: async () => [mockRow({ ...values })] }),
  }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      metaConnections: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update,
    insert,
    delete: del,
  };
  return { db, update, insert, del };
}

const tenantId = 'b2c1d0e0-0000-4000-8000-00000000000b';

describe('MetaRepository', () => {
  it('findLatestMetaConnection consulta query.metaConnections.findFirst (herdado da base)', async () => {
    const { db } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    await repo.findLatestMetaConnection();
    expect(db.query.metaConnections.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findMetaConnectionById consulta por id+tenant', async () => {
    const { db } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    await repo.findMetaConnectionById('conn-1');
    expect(db.query.metaConnections.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findMetaConnectionByMetaUserId consulta por tenant+metaUserId', async () => {
    const { db } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    await repo.findMetaConnectionByMetaUserId('m-1');
    expect(db.query.metaConnections.findFirst).toHaveBeenCalledTimes(1);
  });

  it('createMetaConnection insere e retorna a conexão criada', async () => {
    const { db, insert } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    const conn = await repo.createMetaConnection({ tenantId, metaUserId: 'm-1', accessToken: 'tok' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(conn.tenantId).toBe(tenantId);
    expect(conn.metaUserId).toBe('m-1');
  });

  it('patchMetaConnection usa update e retorna a conexão atualizada', async () => {
    const { db, update } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    const updated = await repo.patchMetaConnection('conn-1', { selectedAdAccountId: 'act_123' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(updated?.selectedAdAccountId).toBe('act_123');
  });

  it('deleteMetaConnection usa operation delete', async () => {
    const { db, del } = makeDb();
    const repo = new MetaRepository(tenantId, db);
    await repo.deleteMetaConnection('conn-1');
    expect(del).toHaveBeenCalledTimes(1);
  });
});