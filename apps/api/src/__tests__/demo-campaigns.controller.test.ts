/*
# Language: pt-BR

Funcionalidade: campanhas demo isoladas da Meta

  Cenário: tenant demo lista e detalha campanhas sem consultar snapshot ou enfileirar sync
    Dado um tenant persistido como demo
    Quando consulta campanhas e uma campanha demo
    Então recebe métricas simuladas positivas e o repositório Meta não é usado

  Cenário: tenant real preserva o caminho normal
    Dado um tenant não demo
    Quando consulta campanhas
    Então o repositório normal é consultado
*/
import { describe, expect, it, vi } from 'vitest';
import { MetaSyncV2Controller } from '../controllers/meta-sync.controller.js';
import { DemoDashboardService } from '../services/dashboard/demo-dashboard.service.js';

function responseRecorder() {
  const json = vi.fn();
  return { json };
}

describe('BDD: campanhas v2 da conta demo', () => {
  it('Cenário: tenant demo lista e detalha campanhas sem consultar snapshot ou enfileirar sync', async () => {
    const metaRepo = { findCampaignSnapshots: vi.fn() };
    const enqueue = vi.fn();
    const controller = new MetaSyncV2Controller(
      {} as never,
      () => metaRepo as never,
      enqueue,
      new DemoDashboardService(() => ({ findTenant: vi.fn().mockResolvedValue({ isDemo: true }) } as never)),
    );
    const list = responseRecorder();
    await controller.getCampaigns({ tenant: { tenantId: 'demo' }, query: {} } as never, list as never, vi.fn());
    const campaigns = list.json.mock.calls[0][0].data;
    expect(campaigns).toHaveLength(3);
    expect(campaigns[0].metrics.conversions).toBeGreaterThan(0);

    const detail = responseRecorder();
    await controller.getCampaignDetail({ tenant: { tenantId: 'demo' }, params: { id: campaigns[0].id } } as never, detail as never, vi.fn());
    expect(detail.json.mock.calls[0][0].data.id).toBe(campaigns[0].id);

    const summary = responseRecorder();
    await controller.getMetricsSummary({ tenant: { tenantId: 'demo' }, query: {} } as never, summary as never, vi.fn());
    expect(summary.json.mock.calls[0][0].data.summary.roas).toBeGreaterThan(1);
    expect(metaRepo.findCampaignSnapshots).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('Cenário: tenant real preserva o caminho normal', async () => {
    const metaRepo = {
      lastSuccessfulRun: vi.fn().mockResolvedValue({ startedAt: new Date() }),
      findCampaignSnapshots: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      countLeadsByCampaign: vi.fn().mockResolvedValue(new Map()),
    };
    const controller = new MetaSyncV2Controller(
      {} as never,
      () => metaRepo as never,
      vi.fn(),
      new DemoDashboardService(() => ({ findTenant: vi.fn().mockResolvedValue({ isDemo: false }) } as never)),
    );
    await controller.getCampaigns({ tenant: { tenantId: 'real' }, query: {} } as never, responseRecorder() as never, vi.fn());
    expect(metaRepo.findCampaignSnapshots).toHaveBeenCalled();
  });
});
