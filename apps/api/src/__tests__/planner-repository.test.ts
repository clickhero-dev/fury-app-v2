import { describe, it, expect, vi } from 'vitest';
import { PlannerRepository } from '../repository/planner.repository.js';

/**
 * Testes unitários do PlannerRepository.
 * Injeta um `db` mockado pelo 2º argumento do construtor (extensibilidade do design),
 * sem tocar no banco real. Cobre o wiring de operações e o retorno.
 */

function mockRow(overrides: Record<string, any> = {}) {
  return { id: 'row-1', tenantId: 'tenant-1', createdAt: new Date(), ...overrides };
}

function makeDb(rowsOf?: any) {
  const rows = rowsOf ?? [];
  const update = vi.fn(() => ({
    set: (setData: any) => ({
      where: (where: any) => ({
        returning: async () => (Array.isArray(rows) ? rows : [rows]),
      }),
    }),
  }));
  const insert = vi.fn(() => ({
    values: (values: any) => ({
      returning: async () => [mockRow({ ...values })],
    }),
  }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      socialPosts: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      campaignPlans: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      metaConnections: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update,
    insert,
    delete: del,
  };
  return { db, update, insert, del };
}

const tenantId = '0fb6d3a7-0000-4000-8000-000000000001';

describe('PlannerRepository', () => {
  it('findPostById consulta query.socialPosts.findFirst', async () => {
    const { db } = makeDb();
    const repo = new PlannerRepository(tenantId, db);
    await repo.findPostById('post-1');
    expect(db.query.socialPosts.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findMetaConnection consulta query.metaConnections.findFirst', async () => {
    const { db } = makeDb();
    const repo = new PlannerRepository(tenantId, db);
    await repo.findActiveMetaConnection();
    await repo.findLatestMetaConnection();
    expect(db.query.metaConnections.findFirst).toHaveBeenCalledTimes(2);
  });

  it('confirmPlan atualiza plano e aprova os posts, retornando o plano', async () => {
    const plan = mockRow({ id: 'plan-1', status: 'active', title: 'P' });
    const { db, update } = makeDb();
    // 1ª atualização ≡ plano (retorna o plano), 2ª ≡ posts (retorna vazio)
    (db.update as any).mockReset();
    update.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: async () => [plan] }) }),
    });
    update.mockReturnValueOnce({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    });

    const repo = new PlannerRepository(tenantId, db);
    const result = await repo.confirmPlan('plan-1');

    expect(update).toHaveBeenCalledTimes(2);
    expect(result?.id).toBe('plan-1');
    expect(result?.status).toBe('active');
  });

  it('createPost insere e retorna o post criado', async () => {
    const { db, insert } = makeDb();
    const repo = new PlannerRepository(tenantId, db);
    const post = await repo.createPost({
      tenantId,
      postType: 'image',
      dayIndex: 10,
      calendarDate: '2026-08-10',
      caption: 'legenda',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(post.tenantId).toBe(tenantId);
    expect(post.dayIndex).toBe(10);
  });

  it('countPostsByPlan retorna número (cast da query count)', async () => {
    const { db } = makeDb();
    const select = vi.fn(() => ({
      from: () => ({ where: async () => [{ total: 5 }] }),
    }));
    db.select = select;
    const repo = new PlannerRepository(tenantId, db);
    const total = await repo.countPostsByPlan('plan-1');
    expect(total).toBe(5);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('listPostKeysByPlan mapeia calendarDate:postType', async () => {
    const { db } = makeDb();
    db.query.socialPosts.findMany.mockResolvedValue([
      { calendarDate: '2026-08-10', postType: 'image' },
      { calendarDate: '2026-08-11', postType: 'reel' },
    ]);
    const repo = new PlannerRepository(tenantId, db);
    const keys = await repo.listPostKeysByPlan('plan-1');
    expect(keys).toEqual(['2026-08-10:image', '2026-08-11:reel']);
  });

  it('clearPlannerData deleta posts e planos do tenant', async () => {
    const { db, del } = makeDb();
    const repo = new PlannerRepository(tenantId, db);
    await repo.clearPlannerData();
    expect(del).toHaveBeenCalledTimes(2);
  });

  it('bulkSchedulePosts atualiza e retorna as linhas', async () => {
    const row = mockRow({ id: 'p1' });
    const { db, update } = makeDb([row]);
    const repo = new PlannerRepository(tenantId, db);
    const result = await repo.bulkSchedulePosts(['p1'], '2026-08-20T10:00:00Z');
    expect(update).toHaveBeenCalledTimes(1);
    expect(result[0].id).toBe('p1');
  });

  it('patchPost usa operation update e retorna o post atualizado', async () => {
    const { db } = makeDb([mockRow({ id: 'p1' })]);
    const repo = new PlannerRepository(tenantId, db);
    const updated = await repo.patchPost('p1', { caption: 'novo' });
    expect(updated?.id).toBe('p1');
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});