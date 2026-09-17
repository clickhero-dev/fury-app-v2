import { describe, it, expect, vi } from 'vitest';
import { StudioAiService } from '../services/studio/studio-ai.service.js';

function makeRepo(override: Record<string, any> = {}) {
  return {
    findTenant: vi.fn(async () => ({ name: 'Negócio X' })),
    findBrandKit: vi.fn(async () => null),
    findAssetById: vi.fn(async () => ({ id: 'a1', type: 'image', url: 'https://cdn/a.jpg', complianceNotes: '{"prompt":"prompt original","model":"bytedance-seed/seedream-4.5"}' })),
    createAsset: vi.fn(async (d: any) => ({ id: 'new-id', ...d })),
    ...override,
  };
}

let repo: any = makeRepo();
const llm = {
  chat: vi.fn(async () => ' prompt melhorado '),
  generateImageWithMeta: vi.fn(async (o: any) => ({ dataUrl: 'data:image/png;base64,AAAA', costUsd: 0.04, model: o.model })),
  generateVideo: vi.fn(async () => 'https://cdn/v.mp4'),
  editImage: vi.fn(async () => 'data:image/png;base64,BBBB'),
};
const quota = {
  consumeCreativeQuota: vi.fn(async () => undefined),
  refundCreativeQuota: vi.fn(async () => undefined),
  consumeModificationQuota: vi.fn(async () => true),
  refundModificationQuota: vi.fn(async () => undefined),
  getModificationsPerCreativeLimit: vi.fn(async () => 3),
};
const svc = new StudioAiService(() => repo as any, llm as any, quota as any);

describe('StudioAiService', () => {
  it('getModels retorna catálogo de 7 imagens (3 FLUX.2 + 4 outras) e 3 vídeos', () => {
    const { image, video } = svc.getModels();
    expect(image).toHaveLength(7);
    expect(image.filter((m) => m.family === 'flux-2')).toHaveLength(3);
    expect(image.filter((m) => m.family === 'outras')).toHaveLength(4);
    expect(video).toHaveLength(3);
    expect(new Set(image.map((m) => m.id)).size).toBe(7);
    for (const m of [...image, ...video]) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.category).toBeTruthy();
      expect(m.description).toBeTruthy();
    }
    expect(video).toHaveLength(3);
  });

  it('enhancePrompt (curto) usa llm.chat', async () => {
    const out = await svc.enhancePrompt('t-1', { prompt: 'pouco', type: 'image' });
    expect(llm.chat).toHaveBeenCalled();
    expect(out.enhancedPrompt).toBe('prompt melhorado');
  });

  it('enhancePrompt (longo) apenas prefixa brand context, sem llm', async () => {
    llm.chat.mockClear();
    const out = await svc.enhancePrompt('t-1', { prompt: 'x'.repeat(120), type: 'video' });
    expect(llm.chat).not.toHaveBeenCalled();
    expect(out.enhancedPrompt).toContain('Marca: Negócio X.');
  });

  it('generateImage consome quota, cria asset e devolve custo + tempo', async () => {
    const out = await svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' });
    expect(quota.consumeCreativeQuota).toHaveBeenCalledWith('t-1');
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0.04, processingTimeMs: expect.any(Number) }));
    expect(out.type).toBe('image');
    expect(out.modificationsRemaining).toBe(3);
    expect(out.costUsd).toBe(0.04);
    expect(typeof out.processingTimeMs).toBe('number');
    expect(out.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('generateImage sem custo no OpenRouter persiste costUsd null', async () => {
    (llm.generateImageWithMeta as any).mockResolvedValueOnce({ dataUrl: 'data:image/png;base64,AAAA', costUsd: null, model: 'x' });
    const out = await svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' });
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null }));
    expect(out.costUsd).toBeNull();
  });

  it('generateImage em falha devolve quota', async () => {
    (llm.generateImageWithMeta as any).mockRejectedValueOnce(new Error('boom'));
    await expect(svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' })).rejects.toThrow();
    expect(quota.refundCreativeQuota).toHaveBeenCalledWith('t-1');
  });

  it('generateImage rejeita reference_image_urls fora da biblioteca do tenant, sem gastar cota nem chamar o LLM', async () => {
    repo = makeRepo({ findBrandKit: vi.fn(async () => ({ photoUrls: ['https://cdn/owned.png'] })) });
    (quota.consumeCreativeQuota as any).mockClear();
    (llm.generateImageWithMeta as any).mockClear();

    await expect(
      svc.generateImage('t-1', {
        model: 'x',
        prompt: 'p'.repeat(20),
        aspect_ratio: '1:1',
        resolution: '2K',
        reference_image_urls: ['https://cdn/nao-pertence.png'],
      }),
    ).rejects.toThrow();

    expect(quota.consumeCreativeQuota).not.toHaveBeenCalled();
    expect(llm.generateImageWithMeta).not.toHaveBeenCalled();
    repo = makeRepo();
  });

  it('generateImage aceita reference_image_urls pertencentes ao tenant e repassa pro LLM + complianceNotes', async () => {
    repo = makeRepo({ findBrandKit: vi.fn(async () => ({ photoUrls: ['https://cdn/a.png', 'https://cdn/b.png'] })) });

    const out = await svc.generateImage('t-1', {
      model: 'x',
      prompt: 'p'.repeat(20),
      aspect_ratio: '9:16',
      resolution: '2K',
      reference_image_urls: ['https://cdn/a.png', 'https://cdn/b.png'],
    });

    expect(out.type).toBe('image');
    expect(llm.generateImageWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrls: ['https://cdn/a.png', 'https://cdn/b.png'] }),
    );
    expect(repo.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        complianceNotes: expect.stringContaining('"referenceImageUrls":["https://cdn/a.png","https://cdn/b.png"]'),
      }),
    );
    repo = makeRepo();
  });

  it('generateImage sem reference_image_urls continua idêntico a hoje (não passa referenceImageUrls pro LLM)', async () => {
    await svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' });
    expect(llm.generateImageWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrls: undefined }),
    );
  });

  it('generateVideo cria asset de vídeo', async () => {
    const out = await svc.generateVideo('t-1', { model: 'v', prompt: 'p'.repeat(20), duration: 4, resolution: '720p', aspect_ratio: '16:9', generate_audio: true });
    expect(out.type).toBe('video');
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'video' }));
  });

  it('regenerate edita e cria asset imagem com custo + tempo', async () => {
    const out = await svc.regenerate('t-1', { assetId: 'a1', feedback: 'mais contraste' });
    expect(llm.chat).toHaveBeenCalled();
    expect(out.type).toBe('image');
    expect(out.assetId).toBe('new-id');
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0.04, processingTimeMs: expect.any(Number) }));
    expect(typeof out.processingTimeMs).toBe('number');
  });

  it('regenerate sem prompt → erro', async () => {
    repo = makeRepo({ findAssetById: vi.fn(async () => ({ id: 'a1', type: 'image', url: 'x', complianceNotes: '{}' })) });
    await expect(svc.regenerate('t-1', { assetId: 'a1', feedback: 'oo' })).rejects.toThrow();
  });

  it('regenerateAd consome modification quota e usa editImage', async () => {
    repo = makeRepo();
    const out = await svc.regenerateAd('t-1', { assetId: 'a1', feedback: 'mudar fundo' });
    expect(quota.consumeModificationQuota).toHaveBeenCalled();
    expect(llm.editImage).toHaveBeenCalled();
    expect(out.type).toBe('image');
  });
});