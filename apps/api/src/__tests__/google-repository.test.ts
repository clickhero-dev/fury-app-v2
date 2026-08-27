import { describe, it, expect, vi } from 'vitest';
import { GoogleRepository } from '../repository/google.repository.js';

/** Testes unitários do GoogleRepository — injeta `db` mockado no construtor. */

function makeDb() {
  const update = vi.fn(() => ({
    set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'p-1', ...s }] }) }),
  }));
  const insert = vi.fn(() => ({
    values: (v: any) => ({ returning: async () => [{ id: 'row-1', ...v }] }),
  }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      googleConnections: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      googleBusinessProfiles: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      googleSyncLogs: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      businessProfileSettings: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update,
    insert,
    delete: del,
  };
  return { db, update, insert, del };
}

const tenantId = 'e5f4e3d2-0000-4000-8000-00000000000e';

describe('GoogleRepository', () => {
  it('findGoogleConnection consulta googleConnections por tenant', async () => {
    const { db } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    await repo.findGoogleConnection();
    expect(db.query.googleConnections.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findGoogleConnectionByRawId consulta por id puro (GLOBAL)', async () => {
    const { db } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    await repo.findGoogleConnectionByRawId('conn-1');
    expect(db.query.googleConnections.findFirst).toHaveBeenCalledTimes(1);
  });

  it('createGoogleConnection insere e retorna', async () => {
    const { db, insert } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    const conn = await repo.createGoogleConnection({ googleUserId: 'u-1', accessToken: 't', refreshToken: 'r' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(conn.tenantId).toBe(tenantId);
  });

  it('patchGoogleConnection usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    await repo.patchGoogleConnection('conn-1', { accountId: 'a-1' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('deleteGoogleConnection usa delete', async () => {
    const { db, del } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    await repo.deleteGoogleConnection('conn-1');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('upsertBusinessProfile insere quando não existe', async () => {
    const { db, insert } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    const id = await repo.upsertBusinessProfile({ name: 'X' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(id).toBe('row-1');
  });

  it('createSyncLog insere log', async () => {
    const { db, insert } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    const log = await repo.createSyncLog({ operation: 'sync', status: 'success' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(log.tenantId).toBe(tenantId);
  });

  it('getBusinessProfile consulta por id+tenant', async () => {
    const { db } = makeDb();
    const repo = new GoogleRepository(tenantId, db);
    await repo.getBusinessProfile('p-1');
    expect(db.query.googleBusinessProfiles.findFirst).toHaveBeenCalledTimes(1);
  });
});