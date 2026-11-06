import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioPublishingController } from '../controllers/studio-publishing.controller.js';
import type { StudioPublishingService } from '../services/studio/studio-publishing.service.js';

// Isola o controller das notificações transacionais de email (que tocam o banco
// via AuthRepository) — o teste valida só o comportamento do controller.
vi.mock('../services/email/notify.js', () => ({
  sendToTenant: vi.fn().mockResolvedValue(undefined),
}));

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

const service = {
  generateImage: vi.fn(),
  listStudioAssetsForTenant: vi.fn(),
  getStudioAssetById: vi.fn(),
  publishAssetToMeta: vi.fn(),
  renderCreative: vi.fn(),
  deleteStudioAsset: vi.fn(),
  getCreativeQuotaSnapshot: vi.fn(),
  downloadStudioAsset: vi.fn(),
} as unknown as StudioPublishingService;

const controller = new StudioPublishingController(service);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudioPublishingController', () => {
  describe('listAssets', () => {
    it('happy: retorna assets + quota snapshot paginado', async () => {
      (service.listStudioAssetsForTenant as any).mockResolvedValue({
        assets: [{ id: 'a-1', type: 'image', url: 'https://example.com/a.png', complianceStatus: 'approved' }],
        total: 1,
        page: 1,
        totalPages: 1,
      });
      (service.getCreativeQuotaSnapshot as any).mockResolvedValue({
        creativesRemaining: 10,
        creativesLimit: 50,
      });

      const req = { tenant: { tenantId: 't-1' }, query: {} } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.listAssets(req, res, next);

      expect(service.listStudioAssetsForTenant).toHaveBeenCalledWith({
        tenantId: 't-1',
        type: undefined,
        status: undefined,
        archived: false,
        page: 1,
        limit: 20,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total: 1,
          page: 1,
          totalPages: 1,
          creativesRemaining: 10,
          creativesLimit: 50,
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('400: query invalida retorna Validation error sem chamar o service', async () => {
      const req = { tenant: { tenantId: 't-1' }, query: { type: 'invalid' } } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.listAssets(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation error' }),
      );
      expect(service.listStudioAssetsForTenant).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('401: sem tenant chama next com AppError', async () => {
      const req = { query: {} } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.listAssets(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
    });
  });

  describe('deleteAsset', () => {
    it('happy: deleta asset e retorna sucesso', async () => {
      (service.deleteStudioAsset as any).mockResolvedValue(undefined);
      const req = { tenant: { tenantId: 't-1' }, params: { assetId: 'a-1' } } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.deleteAsset(req, res, next);

      expect(service.deleteStudioAsset).toHaveBeenCalledWith({ tenantId: 't-1', assetId: 'a-1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('downloadAsset', () => {
    it('happy: entrega o arquivo final com nome informado pelo serviço', async () => {
      (service.downloadStudioAsset as any).mockResolvedValue({
        body: Buffer.from('video-final'), contentType: 'video/mp4', filename: 'criativo-a-1.mp4',
      });
      const req = { tenant: { tenantId: 't-1' }, params: { assetId: 'a-1' } } as any;
      const res = { status: vi.fn().mockReturnThis(), setHeader: vi.fn(), send: vi.fn() } as any;
      const next = vi.fn();

      await controller.downloadAsset(req, res, next);

      expect(service.downloadStudioAsset).toHaveBeenCalledWith({ tenantId: 't-1', assetId: 'a-1' });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="criativo-a-1.mp4"');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('video-final'));
      expect(next).not.toHaveBeenCalled();
    });

    it('401: sem tenant não tenta baixar', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.downloadAsset({ params: { assetId: 'a-1' } } as any, res, next);

      expect(service.downloadStudioAsset).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
    });

    it('400: id vazio não tenta baixar', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.downloadAsset({ tenant: { tenantId: 't-1' }, params: { assetId: '' } } as any, res, next);

      expect(service.downloadStudioAsset).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('generateImage', () => {
    it('400: corpo sem prompt/briefing retorna Validation error', async () => {
      const req = { tenant: { tenantId: 't-1' }, body: { format: 'feed' }, protocol: 'http', get: () => 'localhost' } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.generateImage(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation error' }));
      expect(service.generateImage).not.toHaveBeenCalled();
    });
  });

  describe('uploadToMeta', () => {
    it('400: corpo sem creativeAssetId/adAccountId retorna Validation error', async () => {
      const req = { tenant: { tenantId: 't-1' }, body: {} } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.uploadToMeta(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation error' }));
      expect(service.publishAssetToMeta).not.toHaveBeenCalled();
    });

    it('happy: publica asset e retorna metaAssetId', async () => {
      (service.publishAssetToMeta as any).mockResolvedValue({ hash: 'h-1', metaAssetId: 'mb-1' });
      const req = {
        tenant: { tenantId: 't-1' },
        body: { creativeAssetId: 'a-1', adAccountId: 'act-1' },
      } as any;
      const res = mockRes();
      const next = vi.fn();

      await controller.uploadToMeta(req, res, next);

      expect(service.publishAssetToMeta).toHaveBeenCalledWith({
        tenantId: 't-1',
        assetId: 'a-1',
        adAccountId: 'act-1',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, metaAssetId: 'mb-1', hash: 'h-1' });
    });
  });
});
