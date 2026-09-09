import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioAiController, IMAGE_MODEL_IDS, VIDEO_MODEL_IDS } from '../controllers/studio-ai.controller.js';
import { StudioAiService } from '../services/studio/studio-ai.service.js';

/**
 * Testes do StudioAiController — validação via zod + paridade entre o
 * enum do controller (IMAGES_MODEL_IDS) e o catálogo servido ao front.
 * A paridade garante que um modelo novo não quebre o estúdio: ele precisa
 * entrar NOS DOIS lugares (catálogo + enum), e o teste pega drift (ex.:
 * flux.2-pro já esteve no enum sem estar no catálogo).
 */

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((data: unknown) => { res.body = data; return res; });
  return res;
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
    tenant: { tenantId: 't-1', ...(overrides.tenant ?? {}) },
  } as any;
}

describe('StudioAiController', () => {
  const service = {
    getModels: vi.fn(() => ({ image: [], video: [] })),
    enhancePrompt: vi.fn(),
    generateImage: vi.fn(async () => ({ type: 'image', creativeAssetId: 'a1', imageUrl: 'https://cdn/a.png' })),
    generateVideo: vi.fn(),
    regenerate: vi.fn(),
    regenerateAd: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    service.getModels.mockImplementation(() => new StudioAiService().getModels());
  });

  it('paridade: enum de imagem == catálogo de imagem (sem drift)', () => {
    const { image } = new StudioAiService().getModels();
    const catalogIds = image.map((m) => m.id).sort();
    expect([...IMAGE_MODEL_IDS].sort()).toEqual(catalogIds);
  });

  it('paridade: enum de vídeo == catálogo de vídeo', () => {
    const { video } = new StudioAiService().getModels();
    const catalogIds = video.map((m) => m.id).sort();
    expect([...VIDEO_MODEL_IDS].sort()).toEqual(catalogIds);
  });

  it('cataloga image: 9 modelos (3 FLUX.2 + 6 outras — MAI/MS removido por custo)', () => {
    const { image } = new StudioAiService().getModels();
    expect(image).toHaveLength(9);
    expect(image.filter((m) => m.family === 'flux-2')).toHaveLength(3);
    expect(image.some((m) => m.id.includes('microsoft/mai'))).toBe(false);
  });

  it('generateImage: 400 para modelo fora do enum', async () => {
    const controller = new StudioAiController(service);
    const res = makeRes();
    const next = vi.fn() as any;
    await controller.generateImage(makeReq({ body: { model: 'modelo/inexistente', prompt: 'p'.repeat(20) } }), res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('generateImage: 400 para prompt curto', async () => {
    const controller = new StudioAiController(service);
    const res = makeRes();
    await controller.generateImage(makeReq({ body: { model: 'black-forest-labs/flux.2-max', prompt: 'curto' } }), res, vi.fn());
    expect(res.statusCode).toBe(400);
  });

  it('generateImage: 200 chama service e devolve resultado', async () => {
    const controller = new StudioAiController(service);
    const res = makeRes();
    const next = vi.fn() as any;
    await controller.generateImage(makeReq({ body: { model: 'black-forest-labs/flux.2-max', prompt: 'p'.repeat(20) } }), res, next);
    expect(res.statusCode).toBe(200);
    expect(service.generateImage).toHaveBeenCalledWith('t-1', expect.objectContaining({ model: 'black-forest-labs/flux.2-max' }));
    expect(res.body.imageUrl).toBe('https://cdn/a.png');
  });

  it('generateImage: 200 com modelo novo/edge do catálogo (gpt-image-1)', async () => {
    const controller = new StudioAiController(service);
    const res = makeRes();
    await controller.generateImage(makeReq({ body: { model: 'openai/gpt-image-1', prompt: 'p'.repeat(20) } }), res, vi.fn());
    expect(res.statusCode).toBe(200);
  });
});