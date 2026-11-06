import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { checkSubscriptionActive } from '../middleware/checkSubscriptionActive.js';
import { MetaSyncV2Controller } from '../controllers/meta-sync.controller.js';
import { MetaController } from '../controllers/meta.controller.js';

function demoRequest(path = ''): Request {
  return {
    params: path ? { id: path } : {},
    query: { startDate: '2026-10-01', endDate: '2026-10-07' },
    user: { userId: 'demo-user', tenantId: 'demo-tenant', email: 'demo@fury.test', role: 'demo' },
    tenant: { tenantId: 'demo-tenant' },
  } as unknown as Request;
}

function response() {
  const json = vi.fn();
  return { json } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}

describe('Funcionalidade: modo demonstração isolado', () => {
  it('Cenário: assinatura demo não expira nem consulta a assinatura comercial', async () => {
    const next = vi.fn() as unknown as NextFunction;
    await checkSubscriptionActive(demoRequest(), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('Cenário: dashboard e campanhas demo usam fixtures sem acessar repositório ou Meta', async () => {
    const repoFactory = vi.fn(() => { throw new Error('dados reais não podem ser consultados'); });
    const enqueue = vi.fn();
    const controller = new MetaSyncV2Controller({} as any, repoFactory, enqueue);

    const listRes = response();
    await controller.getCampaigns(demoRequest(), listRes, vi.fn());
    const list = listRes.json.mock.calls[0][0];
    expect(list.data).toHaveLength(3);
    expect(list.data.every((campaign: { spend: number; roas: number }) => campaign.spend > 0 && campaign.roas > 1)).toBe(true);

    const summaryRes = response();
    await controller.getMetricsSummary(demoRequest(), summaryRes, vi.fn());
    expect(summaryRes.json.mock.calls[0][0].data.summary).toMatchObject({ spend: expect.any(Number), roas: expect.any(Number) });

    const detailRes = response();
    await controller.getCampaignDetail(demoRequest('demo-camp-escala'), detailRes, vi.fn());
    expect(detailRes.json.mock.calls[0][0].data).toMatchObject({ id: 'demo-camp-escala', name: expect.any(String) });

    expect(repoFactory).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('Cenário: conexão Meta demo é simulada e campanha inexistente não vaza dados', async () => {
    const metaService = { getTenantMetaConnections: vi.fn() };
    const meta = new MetaController(metaService as any);
    const connectionRes = response() as any;
    connectionRes.status = vi.fn().mockReturnValue(connectionRes);
    await meta.getConnections(demoRequest(), connectionRes, vi.fn());
    expect(connectionRes.json).toHaveBeenCalledWith(expect.objectContaining({ demo: true }));
    expect(metaService.getTenantMetaConnections).not.toHaveBeenCalled();

    const controller = new MetaSyncV2Controller({} as any, vi.fn(() => { throw new Error('não deve consultar dados reais'); }));
    const next = vi.fn();
    await controller.getCampaignDetail(demoRequest('other-tenant-campaign'), response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAMPAIGN_NOT_FOUND', statusCode: 404 }));
  });

  it('Cenário: usuário não demo segue o caminho tenant-bound normal', async () => {
    const repo = { lastSuccessfulRun: vi.fn().mockResolvedValue(new Date()), findCampaignSnapshots: vi.fn().mockResolvedValue({ items: [], total: 0 }), countLeadsByCampaign: vi.fn().mockResolvedValue(new Map()) };
    const controller = new MetaSyncV2Controller({} as any, vi.fn(() => repo as any));
    const req = demoRequest();
    req.user!.role = 'owner';
    const res = response();
    await controller.getCampaigns(req, res, vi.fn());
    expect(repo.lastSuccessfulRun).toHaveBeenCalled();
  });
});
