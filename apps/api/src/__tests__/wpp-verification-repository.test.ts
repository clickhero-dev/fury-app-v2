import { describe, it, expect, vi } from 'vitest';
import { WppVerificationRepository } from '../repository/wpp-verification.repository.js';

/** Testes unitários do WppVerificationRepository — injeta `db` mockado no construtor. */

function makeDb() {
  const insert = vi.fn(() => ({
    values: (v: any) => ({ returning: async () => [{ id: 'ver-1', ...v }] }),
  }));
  const update = vi.fn(() => ({
    set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'ver-1', ...s }] }) }),
  }));
  const db: any = {
    query: {
      wppVerifications: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
    },
    insert,
    update,
  };
  return { db, insert, update };
}

const tenantId = 'c3d2e1f0-0000-4000-8000-00000000000c';

describe('WppVerificationRepository', () => {
  it('createPending insere com tenantId do escopo e retorna a row', async () => {
    const { db, insert } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    const row = await repo.createPending({
      phone: '5511999999999',
      codeHash: 'abc123',
      expiresAt: new Date('2026-09-21T16:00:00Z'),
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(row.tenantId).toBe(tenantId);
    expect(row.status).toBe('pending');
  });

  it('findLatestPendingByPhone consulta wppVerifications.findFirst', async () => {
    const { db } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    await repo.findLatestPendingByPhone('5511999999999');
    expect(db.query.wppVerifications.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findById consulta wppVerifications.findFirst', async () => {
    const { db } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    await repo.findById('ver-1');
    expect(db.query.wppVerifications.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findLatestByTenant consulta wppVerifications.findFirst (status() do service)', async () => {
    const { db } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    await repo.findLatestByTenant();
    expect(db.query.wppVerifications.findFirst).toHaveBeenCalledTimes(1);
  });

  it('markVerified faz update retornando a row', async () => {
    const { db, update } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    const row = await repo.markVerified('ver-1');
    expect(update).toHaveBeenCalledTimes(1);
    expect(row?.id).toBe('ver-1');
  });

  it('incrementAttempts faz update retornando a row', async () => {
    const { db, update } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    const row = await repo.incrementAttempts('ver-1');
    expect(update).toHaveBeenCalledTimes(1);
    expect(row?.id).toBe('ver-1');
  });

  it('countSentSince consulta wppVerifications.findMany', async () => {
    const { db } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    await repo.countSentSince('5511999999999', new Date('2026-09-21T15:00:00Z'));
    expect(db.query.wppVerifications.findMany).toHaveBeenCalledTimes(1);
  });

  it('markExpired faz update (status expired)', async () => {
    const { db, update } = makeDb();
    const repo = new WppVerificationRepository(tenantId, db);
    await repo.markExpired('ver-1');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
