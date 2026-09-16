import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { openrouterService } from '../services/llms/openrouter.service.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';

function mockImagesResponse(payload: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u === `${OPENROUTER_BASE}/images`) {
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

async function pngBase64(width: number, height: number): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  return buf.toString('base64');
}

async function dimensionsOf(dataUrl: string): Promise<{ width?: number; height?: number }> {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  return sharp(Buffer.from(match![1], 'base64')).metadata();
}

describe('openrouterService.generateImageWithMeta — custo real', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env.OPENROUTER_API_KEY = origKey; });

  it('captura usage.cost quando o OpenRouter retorna', async () => {
    mockImagesResponse({ data: [{ b64_json: PIXEL_B64 }], usage: { total_tokens: 4175, cost: 0.04 } });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
    });

    expect(result.dataUrl).toMatch(/^data:image\/\w+;base64,/);
    expect(result.costUsd).toBe(0.04);
    expect(result.model).toBe('black-forest-labs/flux.2-max');
  });

  it('costUsd é null quando usage.cost está ausente (sem estimativa)', async () => {
    mockImagesResponse({ data: [{ b64_json: PIXEL_B64 }] });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
    });

    expect(result.dataUrl).toMatch(/^data:image\/\w+;base64,/);
    expect(result.costUsd).toBeNull();
  });

  it('generateImage (legado) continua devolvendo apenas a data URL', async () => {
    mockImagesResponse({ data: [{ b64_json: PIXEL_B64 }], usage: { cost: 0.04 } });

    const result = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
    });

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^data:image\/\w+;base64,/);
  });
});

describe('openrouterService.generateImageWithMeta — normalização de pixel (normalizePixels)', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env.OPENROUTER_API_KEY = origKey; });

  it('normaliza para 1080x1920 quando normalizePixels=true e aspect_ratio=9:16, mesmo se o provedor devolver outro tamanho', async () => {
    mockImagesResponse({ data: [{ b64_json: await pngBase64(700, 700) }] });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      aspect_ratio: '9:16',
      normalizePixels: true,
    });

    const meta = await dimensionsOf(result.dataUrl);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('normaliza para 1080x1080 quando normalizePixels=true e aspect_ratio=1:1, mesmo se o provedor devolver outro tamanho', async () => {
    mockImagesResponse({ data: [{ b64_json: await pngBase64(900, 950) }] });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      aspect_ratio: '1:1',
      normalizePixels: true,
    });

    const meta = await dimensionsOf(result.dataUrl);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it('NÃO normaliza quando aspect_ratio é passado sem normalizePixels — cobre o Planejador IA, que já manda aspect_ratio hoje sem pedir normalização', async () => {
    mockImagesResponse({ data: [{ b64_json: await pngBase64(700, 700) }] });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      aspect_ratio: '9:16', // como aspectForPlannerPostType manda hoje
    });

    const meta = await dimensionsOf(result.dataUrl);
    expect(meta.width).toBe(700);
    expect(meta.height).toBe(700);
  });

  it('NÃO normaliza quando nem aspect_ratio nem normalizePixels são passados (regenerate-ad hoje)', async () => {
    mockImagesResponse({ data: [{ b64_json: await pngBase64(700, 700) }] });

    const result = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
    });

    const meta = await dimensionsOf(result.dataUrl);
    expect(meta.width).toBe(700);
    expect(meta.height).toBe(700);
  });
});

describe('openrouterService.generateImageWithMeta — referenceImageUrls (input_references)', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env.OPENROUTER_API_KEY = origKey; });

  it('manda input_references (array, formato oficial) quando referenceImageUrls é passado', async () => {
    const mockBodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        if (typeof init?.body === 'string') mockBodies.push(init.body);
        return new Response(JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      referenceImageUrls: ['https://cdn/a.png', 'https://cdn/b.png'],
    });

    const reqBody = JSON.parse(mockBodies[0]);
    expect(reqBody.input_references).toEqual([
      { type: 'image_url', image_url: { url: 'https://cdn/a.png' } },
      { type: 'image_url', image_url: { url: 'https://cdn/b.png' } },
    ]);
    expect(reqBody.image).toBeUndefined();
  });

  it('NÃO mistura logoUrl no array de referência — logo fica de fora do body quando há referenceImageUrls', async () => {
    const mockBodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        if (typeof init?.body === 'string') mockBodies.push(init.body);
        return new Response(JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }), { status: 200 });
      }
      // Fetch da logo (composite visual continua rodando à parte)
      return new Response(Buffer.from(PIXEL_B64, 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
    });

    await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      referenceImageUrls: ['https://cdn/a.png'],
      logoUrl: 'https://cdn/logo.png',
    });

    const reqBody = JSON.parse(mockBodies[0]);
    expect(reqBody.input_references).toBeDefined();
    expect(reqBody.image).toBeUndefined();
  });

  it('sem referenceImageUrls, continua mandando `image` (comportamento de hoje, regressão)', async () => {
    const mockBodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        if (typeof init?.body === 'string') mockBodies.push(init.body);
        return new Response(JSON.stringify({ data: [{ b64_json: PIXEL_B64 }] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-max',
      prompt: 'test prompt',
      logoUrl: 'https://cdn/logo.png',
    });

    const reqBody = JSON.parse(mockBodies[0]);
    expect(reqBody.image).toBe('https://cdn/logo.png');
    expect(reqBody.input_references).toBeUndefined();
  });
});