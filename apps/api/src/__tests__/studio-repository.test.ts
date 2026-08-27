import { describe, it, expect, vi } from 'vitest';
import { StudioRepository } from '../repository/studio.repository.js';

/**
 * Testes unitários do StudioRepository.
 * Injeta um `db` mockado pelo 2º argumento do construtor (design), sem tocar no banco real.
 */

function mockRow(overrides: Record<string, any> = {}) {
  return { id: 'asset-1', tenantId: 'tenant-1', type: 'image', complianceStatus: 'pending_compliance', createdAt: new Date(), ...overrides };
}

function makeDb(rootRow?: any) {
  const update = vi.fn(() => ({
    set: (setData: any) => ({ where: (where: any) => ({ returning: async () => [mockRow({ ...setData })] }) }),
  }));
  const insert = vi.fn(() => ({
    values: (values: any) => ({ returning: async () => [mockRow({ ...values })] }),
  }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const select = vi.fn(() => ({ from: () => ({ where: async () => [{ total: 3 }] }) }));
  const db: any = {
    query: {
      creativeAssets: {
        findFirst: vi.fn(async () => rootRow ?? null),
        findMany: vi.fn(async () => [rootRow ?? mockRow()]),
      },
    },
    select,
    update,
    insert,
    delete: del,
  };
  return { db, update, insert, del, select };
}

const tenantId = '9e9d3a10-0000-4000-8000-00000000000a';

describe('StudioRepository', () => {
  it('createAsset insere e retorna o asset criado', async () => {
    const { db, insert } = makeDb();
    const repo = new StudioRepository(tenantId, db);
    const asset = await repo.createAsset({ tenantId, type: 'image', url: 'https://cdn/x.png', complianceStatus: 'pending_compliance' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(asset.tenantId).toBe(tenantId);
    expect(asset.type).toBe('image');
  });

  it('deleteAsset usa operation delete', async () => {
    const { db, del } = makeDb();
    const repo = new StudioRepository(tenantId, db);
    await repo.deleteAsset('asset-1');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('patchAsset usa operation update e retorna o asset atualizado', async () => {
    const { db, update } = makeDb();
    const repo = new StudioRepository(tenantId, db);
    const updated = await repo.patchAsset('asset-1', { metaAssetId: 'meta-1' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(updated?.metaAssetId).toBe('meta-1');
  });

  it('findAssetById consulta query.creativeAssets.findFirst', async () => {
    const { db } = makeDb(mockRow({ id: 'asset-9' }));
    const repo = new StudioRepository(tenantId, db);
    const asset = await repo.findAssetById('asset-9');
    expect(db.query.creativeAssets.findFirst).toHaveBeenCalledTimes(1);
    expect(asset?.id).toBe('asset-9');
  });

  it('findAssetByUrl consulta query.creativeAssets.findFirst', async () => {
    const { db } = makeDb(mockRow({ url: 'https://cdn/x.png' }));
    const repo = new StudioRepository(tenantId, db);
    const asset = await repo.findAssetByUrl('https://cdn/x.png');
    expect(db.query.creativeAssets.findFirst).toHaveBeenCalledTimes(1);
    expect(asset?.url).toBe('https://cdn/x.png');
  });

  it('listAssets retorna rows, total e mapa de modificationsRemaining por raiz', async () => {
    const { db, select } = makeDb();
    const rootRow = { id: 'root-1', modificationsRemaining: 2 };
    db.query.creativeAssets.findMany.mockResolvedValueOnce([
      mockRow({ id: 'a1', rootAssetId: 'root-1' }),
      mockRow({ id: 'a2', rootAssetId: 'root-1' }),
    ]).mockResolvedValueOnce([rootRow]);

    const repo = new StudioRepository(tenantId, db);
    const result = await repo.listAssets({ page: 1, limit: 20 });

    expect(select).toHaveBeenCalledTimes(1);
    expect(result.rows.length).toBe(2);
    expect(result.total).toBe(3);
    expect(result.modificationsRemainingByRootId.get('root-1')).toBe(2);
  });
});