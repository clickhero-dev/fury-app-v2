import { describe, it, expect, vi } from 'vitest';
import { OpenRouterStudioService } from '../services/openrouter/openrouter-studio.service.js';

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
  generateImage: vi.fn(async () => 'data:image/png;base64,AAAA'),
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
const svc = new OpenRouterStudioService(() => repo as any, llm as any, quota as any);

describe('OpenRouterStudioService', () => {
  it('getModels retorna catálogo', () => {
    const { image, video } = svc.getModels();
    expect(image).toHaveLength(3);
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

  it('generateImage consome quota e cria asset', async () => {
    const out = await svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' });
    expect(quota.consumeCreativeQuota).toHaveBeenCalledWith('t-1');
    expect(repo.createAsset).toHaveBeenCalled();
    expect(out.type).toBe('image');
    expect(out.modificationsRemaining).toBe(3);
  });

  it('generateImage em falha devolve quota', async () => {
    (llm.generateImage as any).mockRejectedValueOnce(new Error('boom'));
    await expect(svc.generateImage('t-1', { model: 'x', prompt: 'p'.repeat(20), aspect_ratio: '1:1', resolution: '2K' })).rejects.toThrow();
    expect(quota.refundCreativeQuota).toHaveBeenCalledWith('t-1');
  });

  it('generateVideo cria asset de vídeo', async () => {
    const out = await svc.generateVideo('t-1', { model: 'v', prompt: 'p'.repeat(20), duration: 4, resolution: '720p', aspect_ratio: '16:9', generate_audio: true });
    expect(out.type).toBe('video');
    expect(repo.createAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'video' }));
  });

  it('regenerate edita e cria asset imagem', async () => {
    const out = await svc.regenerate('t-1', { assetId: 'a1', feedback: 'mais contraste' });
    expect(llm.chat).toHaveBeenCalled();
    expect(out.type).toBe('image');
    expect(out.assetId).toBe('new-id');
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