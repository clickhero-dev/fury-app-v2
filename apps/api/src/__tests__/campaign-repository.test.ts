import { describe, it, expect, vi } from 'vitest';
import { CampaignRepository } from '../repository/campaign.repository.js';

/** Testes unitários do CampaignRepository — injeta `db` mockado no construtor. */

function makeDb() {
  const update = vi.fn(() => ({
    set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'c-1', ...s }] }) }),
  }));
  const insert = vi.fn(() => ({
    values: (v: any) => ({ returning: async () => [{ id: 'c-new', ...v }] }),
  }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      campaigns: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      creativeAssets: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      furyInsights: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      automationRules: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update,
    insert,
    delete: del,
  };
  return { db, update, insert, del };
}

const tenantId = 'd4e3f2c1-0000-4000-8000-00000000000d';

describe('CampaignRepository', () => {
  it('findCampaignById consulta campaigns.findFirst (escopado por tenant)', async () => {
    const { db } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    await repo.findCampaignById('c-1');
    expect(db.query.campaigns.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findCampaignByMetaId consulta por metaCampaignId', async () => {
    const { db } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    await repo.findCampaignByMetaId('meta-1');
    expect(db.query.campaigns.findFirst).toHaveBeenCalledTimes(1);
  });

  it('findCampaigns retorna { items, total }', async () => {
    const { db } = makeDb();
    db.query.campaigns.findMany.mockResolvedValueOnce([{ id: 'c-1' }]).mockResolvedValueOnce([{ id: 'c-1' }, { id: 'c-2' }]);
    const repo = new CampaignRepository(tenantId, db);
    const result = await repo.findCampaigns();
    expect(result.items.length).toBe(1);
    expect(result.total).toBe(2);
  });

  it('createCampaign insere com tenantId e retorna a campanha', async () => {
    const { db, insert } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    const campaign = await repo.createCampaign({ name: 'C' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(campaign.tenantId).toBe(tenantId);
  });

  it('updateCampaign usa update e retorna a campanha', async () => {
    const { db, update } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    const updated = await repo.updateCampaign('c-1', { status: 'paused' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(updated.status).toBe('paused');
  });

  it('deleteCampaign usa delete', async () => {
    const { db, del } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    await repo.deleteCampaign('c-1');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('findActiveAutomationRules consulta automationRules', async () => {
    const { db } = makeDb();
    const repo = new CampaignRepository(tenantId, db);
    await repo.findActiveAutomationRules();
    expect(db.query.automationRules.findMany).toHaveBeenCalledTimes(1);
  });
});