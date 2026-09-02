import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { CampaignsController } from '../controllers/campaigns.controller.js';
import type { CampaignsService } from '../services/campaigns/campaigns.service.js';

vi.mock('../services/email/notify.js', () => ({
  sendToTenant: vi.fn().mockResolvedValue(undefined),
}));

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    tenant: { tenantId: 'tenant-foo' },
    setTimeout: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setTimeout = vi.fn(() => res);
  res.on = vi.fn(() => res);
  res.off = vi.fn(() => res);
  res.headersSent = false;
  return res;
}

function makeController(service: Partial<CampaignsService> = {}) {
  const svc = service as CampaignsService;
  const repoFactory = vi.fn();
  return new CampaignsController(svc, repoFactory as any);
}

describe('CampaignsController', () => {
  const next: NextFunction = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('returna 201 com a campanha criada (happy path)', async () => {
      const campaign = { id: 'c1', name: 'Minha Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' };
      const ctrl = makeController({ createCampaign: vi.fn().mockResolvedValue(campaign) });
      const req = makeReq({ body: { name: 'Minha Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' } });
      const res = makeRes();

      await ctrl.createCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: campaign }));
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 400/validação quando body é inválido', async () => {
      const ctrl = makeController();
      const req = makeReq({ body: { name: 'X', objective: 'INVALIDO', dailyBudget: 1 } });
      const res = makeRes();

      await ctrl.createCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCampaign', () => {
    it('retorna o detail da campanha (happy path)', async () => {
      const detail = { id: 'c1', name: 'Minha Campanha' };
      const ctrl = makeController({ getCampaignPanelDetail: vi.fn().mockResolvedValue(detail) });
      const req = makeReq({ params: { id: 'c1' } });
      const res = makeRes();

      await ctrl.getCampaign(req, res, next);

      expect(res.json).toHaveBeenCalledWith(detail);
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a campanha não existe', async () => {
      const ctrl = makeController({ getCampaignPanelDetail: vi.fn().mockResolvedValue(null) });
      const req = makeReq({ params: { id: 'nao-existe' } });
      const res = makeRes();

      await ctrl.getCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Campanha não encontrada' });
    });
  });

  describe('getCampaigns', () => {
    it('retorna campanhas com paginação (happy path, sem cache)', async () => {
      const result = { items: [{ id: 'c1' }], total: 1 };
      const ctrl = makeController({ getCampaigns: vi.fn().mockResolvedValue(result) });
      const req = makeReq({ query: { limit: '10', offset: '0' } });
      const res = makeRes();

      await ctrl.getCampaigns(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: result.items,
          pagination: { total: 1, limit: 10, offset: 0 },
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createWizardCampaign multi-criativo', () => {
    const baseBody = {
      objective: 'engagement',
      location_city: 'São Paulo',
      age_min: 18,
      age_max: 45,
      gender: 'all',
      daily_budget_brl: 30,
    };

    const lastNextError = () =>
      (next as unknown as { mock: { calls: Array<[unknown]> } }).mock.calls[0]?.[0] as
        | { name?: string; issues?: Array<{ message: string }> }
        | undefined;

    it('201 com creatives[] de 2 itens → service recebe creatives mapeado e status 201', async () => {
      const createCampaignFromWizard = vi.fn().mockResolvedValue({ success: true });
      const ctrl = makeController({ createCampaignFromWizard });
      const req = makeReq({
        body: {
          ...baseBody,
          creatives: [
            { creative_upload_url: 'https://example.com/a.jpg', headline: 'T1', primary_text: 'P1' },
            { creative_upload_url: 'https://example.com/b.jpg', headline: 'T2', primary_text: 'P2' },
          ],
        },
      });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(createCampaignFromWizard).toHaveBeenCalledWith(
        expect.objectContaining({
          creatives: [
            {
              creativeAssetId: undefined,
              creativeUploadUrl: 'https://example.com/a.jpg',
              creativeInstagramMediaId: undefined,
              creativeMediaUrl: undefined,
              headline: 'T1',
              primaryText: 'P1',
              destinationUrl: undefined,
            },
            {
              creativeAssetId: undefined,
              creativeUploadUrl: 'https://example.com/b.jpg',
              creativeInstagramMediaId: undefined,
              creativeMediaUrl: undefined,
              headline: 'T2',
              primaryText: 'P2',
              destinationUrl: undefined,
            },
          ],
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    it('400 quando um item de creatives não tem imagem → ZodError', async () => {
      const ctrl = makeController();
      const req = makeReq({
        body: {
          ...baseBody,
          creatives: [
            { creative_upload_url: 'https://example.com/a.jpg', headline: 'T1', primary_text: 'P1' },
            { headline: 'T2', primary_text: 'P2' },
          ],
        },
      });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
      expect(JSON.stringify(lastNextError()?.issues)).toContain(
        'Cada criativo deve ter imagem da galeria, upload ou post do Instagram.'
      );
    });

    it('400 quando creatives tem 5 itens (cap 4) → ZodError', async () => {
      const ctrl = makeController();
      const req = makeReq({
        body: {
          ...baseBody,
          creatives: Array.from({ length: 5 }, (_, i) => ({
            creative_upload_url: `https://example.com/${i}.jpg`,
            headline: `T${i}`,
            primary_text: `P${i}`,
          })),
        },
      });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    });

    it('400 quando creatives ausente e legacy sem imagem → mantém mensagem atual', async () => {
      const ctrl = makeController();
      const req = makeReq({ body: { ...baseBody, headline: 'T1', primary_text: 'P1' } });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
      expect(JSON.stringify(lastNextError()?.issues)).toContain(
        'Selecione uma imagem da galeria, envie um arquivo ou escolha um post do Instagram.'
      );
    });

    it('400 quando creatives ausente e legacy sem headline/primary_text → ZodError (refine legado)', async () => {
      const ctrl = makeController();
      const req = makeReq({
        body: { ...baseBody, creative_upload_url: 'https://example.com/a.jpg' },
      });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
      expect(JSON.stringify(lastNextError()?.issues)).toContain(
        'Informe o título (headline) e o texto principal (primary text).'
      );
    });
  });
});