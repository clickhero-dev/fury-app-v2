import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/redis.js', () => {
  const make = () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    setex: vi.fn(async () => 'OK'),
    expire: vi.fn(async () => 1),
    del: vi.fn(async () => 1),
    mget: vi.fn(async () => [null]),
    keys: vi.fn(async () => []),
    client: null as any,
  });
  return { getRedis: () => make() };
});

import { ObservabilityService } from '../services/observability/observability.service.js';

const db: any = { execute: vi.fn() };
const svc = new ObservabilityService(db);

beforeEach(() => {
  db.execute.mockReset();
  db.execute.mockResolvedValue([{ status: 'active', total: 5 }]);
});

describe('ObservabilityService', () => {
  it('listKpiMeta devolve 20 KPIs com id/label/category', () => {
    const list = svc.listKpiMeta();
    expect(list.length).toBeGreaterThanOrEqual(20);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('category');
  });

  it('getKpi de id desconhecido → null', async () => {
    await expect(svc.getKpi('NAO_EXISTE')).resolves.toBeNull();
  });

  it('getKpi executa a query e devolve rows (cache miss → db.execute)', async () => {
    const out = await svc.getKpi('B1_campaigns_by_status');
    expect(out).not.toBeNull();
    expect(db.execute).toHaveBeenCalled();
    expect(out!.rows).toEqual([{ status: 'active', total: 5 }]);
  });

  it('getAllKpis tolera erro de query individual', async () => {
    db.execute.mockRejectedValueOnce(new Error('boom'));
    const all = await svc.getAllKpis();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(20);
  });
});