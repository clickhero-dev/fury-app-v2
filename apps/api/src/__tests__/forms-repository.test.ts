import { describe, it, expect, vi } from 'vitest';
import { FormsRepository } from '../repository/forms.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'f-1', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: 'f-new', ...v }] }) }));
  const db: any = {
    query: { formSubmissions: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) } },
    update, insert, delete: vi.fn(() => ({ where: async () => {} })),
  };
  return { db, update, insert };
}
const tenantId = 'aaaa0000-0000-4000-8000-00000000000a';

describe('FormsRepository', () => {
  it('createFormSubmission insere com tenantId', async () => {
    const { db, insert } = makeDb();
    const repo = new FormsRepository(tenantId, db);
    const sub = await repo.createFormSubmission({ status: 'PENDING' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(sub.tenantId).toBe(tenantId);
  });

  it('findFormSubmission consulta por id+tenant', async () => {
    const { db } = makeDb();
    const repo = new FormsRepository(tenantId, db);
    await repo.findFormSubmission('f-1');
    expect(db.query.formSubmissions.findFirst).toHaveBeenCalledTimes(1);
  });

  it('patchFormSubmission usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new FormsRepository(tenantId, db);
    const updated = await repo.patchFormSubmission('f-1', { status: 'COMPLETED' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(updated?.status).toBe('COMPLETED');
  });
});