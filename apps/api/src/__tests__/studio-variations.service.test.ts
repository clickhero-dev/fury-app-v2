/**
 * Funcionalidade: gerar variações no Estúdio
 * Cenário: a origem do asset determina o adapter usado
 * Dado um asset de criação rápida ou do wizard
 * Quando o usuário confirma um lote de variações
 * Então o adapter correspondente é usado, o lote é idempotente e falhas não vazam detalhes técnicos
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioVariationsService } from '../services/studio/studio-variations.service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';
const batchId = '33333333-3333-4333-8333-333333333333';

function asset(notes: Record<string, unknown> = {}) {
  return { id: assetId, tenantId, type: 'image', archivedAt: null, complianceNotes: JSON.stringify(notes) } as any;
}

describe('StudioVariationsService', () => {
  const repo = { findAssetById: vi.fn() };
  const jobs = {
    findOrCreateStudioVariationsJob: vi.fn(),
    claimStudioVariationsJob: vi.fn().mockResolvedValue(true),
    patchWorkflowJob: vi.fn(),
    getStudioVariationsJob: vi.fn(),
  };
  const creative = { regenerateCreative: vi.fn() };
  const quick = { regenerateAd: vi.fn() };
  let service: StudioVariationsService;

  beforeEach(() => {
    vi.resetAllMocks();
    jobs.claimStudioVariationsJob.mockResolvedValue(true);
    service = new StudioVariationsService(() => repo as any, () => jobs as any, creative as any, quick as any);
  });

  it('usa o adapter da criação rápida sem emitir erro de contexto', async () => {
    repo.findAssetById.mockResolvedValue(asset({ source: 'openrouter-image', model: 'flux' }));
    jobs.findOrCreateStudioVariationsJob.mockResolvedValue({ id: batchId, metadata: null, status: 'pending' });
    quick.regenerateAd.mockResolvedValue({ assetId: '44444444-4444-4444-8444-444444444444', imageUrl: 'https://img/1' });

    const result = await service.createBatch(tenantId, { batchId, assetId }, 'https://api.test');

    expect(quick.regenerateAd).toHaveBeenCalledTimes(3);
    expect(creative.regenerateCreative).not.toHaveBeenCalled();
    expect(result.slots.filter((slot) => slot.status === 'succeeded')).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('CONTEXT_NOT_FOUND');
  });

  it('Cenário: lote recém-criado com slots vazios inicializa e retorna as três variações', async () => {
    repo.findAssetById.mockResolvedValue(asset({ source: 'openrouter-image', model: 'flux' }));
    // O repositório persiste o lote novo com slots: []; o serviço precisa
    // completar os slots antes de iniciar a geração.
    jobs.findOrCreateStudioVariationsJob.mockResolvedValue({
      id: batchId,
      metadata: { batchId, assetId, origin: 'quick', slots: [] },
      status: 'pending',
    });
    quick.regenerateAd.mockResolvedValue({ assetId: '44444444-4444-4444-8444-444444444444', imageUrl: 'https://img/1' });

    const result = await service.createBatch(tenantId, { batchId, assetId }, 'https://api.test');

    expect(quick.regenerateAd).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: 'succeeded' });
    expect(result.slots).toHaveLength(3);
  });

  it('preserva o contrato criativo para assets do wizard', async () => {
    repo.findAssetById.mockResolvedValue(asset({ context: { layout: 'offer_burst', businessName: 'Acme' } }));
    jobs.findOrCreateStudioVariationsJob.mockResolvedValue({ id: batchId, metadata: null, status: 'pending' });
    creative.regenerateCreative.mockResolvedValue({ assetId: '55555555-5555-4555-8555-555555555555', imageUrl: 'https://img/2' });

    await service.createBatch(tenantId, { batchId, assetId }, 'https://api.test');

    expect(creative.regenerateCreative).toHaveBeenCalledTimes(3);
    expect(quick.regenerateAd).not.toHaveBeenCalled();
  });

  it('replay do mesmo lote não duplica chamadas', async () => {
    repo.findAssetById.mockResolvedValue(asset({ source: 'openrouter-image', model: 'flux' }));
    jobs.findOrCreateStudioVariationsJob.mockResolvedValue({
      id: batchId,
      status: 'done',
      metadata: { batchId, assetId, slots: [{ index: 0, status: 'succeeded' }] },
    });

    const result = await service.createBatch(tenantId, { batchId, assetId }, 'https://api.test');

    expect(quick.regenerateAd).not.toHaveBeenCalled();
    expect(result.batchId).toBe(batchId);
  });

  it('recusa asset ausente sem iniciar geração', async () => {
    repo.findAssetById.mockResolvedValue(null);

    await expect(service.createBatch(tenantId, { batchId, assetId }, 'https://api.test'))
      .rejects.toMatchObject({ statusCode: 404, code: 'CREATIVE_ASSET_NOT_FOUND' });
    expect(jobs.findOrCreateStudioVariationsJob).not.toHaveBeenCalled();
  });

  it('cancela slots ainda não iniciados sem apagar o lote', async () => {
    jobs.getStudioVariationsJob.mockResolvedValue({
      id: batchId,
      status: 'running',
      metadata: { batchId, assetId, origin: 'quick', slots: [{ index: 0, status: 'running' }, { index: 1, status: 'pending' }] },
    });

    const result = await service.cancelBatch(tenantId, batchId);

    expect(result.status).toBe('cancelled');
    expect(result.slots[1].status).toBe('cancelled');
    expect(jobs.patchWorkflowJob).toHaveBeenCalledWith(batchId, expect.objectContaining({ currentStage: 'cancelled' }));
  });

  it('converte falha do provedor em estado parcial client-safe', async () => {
    repo.findAssetById.mockResolvedValue(asset({ source: 'openrouter-image', model: 'flux' }));
    jobs.findOrCreateStudioVariationsJob.mockResolvedValue({ id: batchId, metadata: null, status: 'pending' });
    quick.regenerateAd.mockRejectedValue(new Error('provider secret and prompt must not reach client'));

    const result = await service.createBatch(tenantId, { batchId, assetId }, 'https://api.test');

    expect(result.status).toBe('partial');
    expect(result.slots[0]).toMatchObject({ status: 'failed', errorCode: 'VARIATION_GENERATION_FAILED', retryable: false });
    expect(JSON.stringify(result)).not.toContain('provider secret');
  });
});
