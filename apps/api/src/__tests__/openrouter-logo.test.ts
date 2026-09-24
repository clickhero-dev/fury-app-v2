import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { openrouterService } from '../services/llms/openrouter.service.js';

// 10x10 PNG: red (#FF0000)
const RED_PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC';
// 10x10 PNG: blue (#0000FF)
const BLUE_PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEUlEQVR4nGNgYPiPF41KY0EA8INjnagJNDwAAAAASUVORK5CYII=';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

describe('openrouterService.generateImage — logo', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env.OPENROUTER_API_KEY = origKey; });

  it('deve enviar logoUrl como image no body do fetch', async () => {
    const mockBodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      const body = typeof init?.body === 'string' ? init.body : null;

      if (u === `${OPENROUTER_BASE}/images`) {
        // OpenRouter POST — record body and return mock
        if (body) mockBodies.push(body);
        return new Response(JSON.stringify({ data: [{ b64_json: RED_PIXEL_B64 }] }), { status: 200 });
      }
      // Logo URL fetch
      if (u === 'https://cdn.fury.app/logo.png') {
        const buf = Buffer.from(BLUE_PIXEL_B64, 'base64');
        return new Response(buf, { status: 200, headers: { 'content-type': 'image/png' } });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: 'test prompt',
      logoUrl: 'https://cdn.fury.app/logo.png',
    });

    // 1 — fetch body contém ?image
    expect(mockBodies.length).toBe(1);
    const reqBody = JSON.parse(mockBodies[0]);
    expect(reqBody.image).toBe('https://cdn.fury.app/logo.png');
    expect(reqBody.model).toBe('black-forest-labs/flux.2-klein-4b');
    expect(reqBody.prompt).toBe('test prompt');

    // 2 — result é dataUrl
    expect(result).toMatch(/^data:image\/\w+;base64,/);

    // 3 — result NÃO é o mesmo que RED_PIXEL (logo foi composite)
    expect(result).not.toBe(`data:image/png;base64,${RED_PIXEL_B64}`);

    // 4 — result é MAIOR que RED_PIXEL (1080x1080 + logo, não 1x1)
    expect(result.length).toBeGreaterThan(`data:image/png;base64,${RED_PIXEL_B64}`.length);
  });

  it('não deve enviar image param quando logoUrl é undefined', async () => {
    const mockBodies: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      const body = typeof init?.body === 'string' ? init.body : null;
      if (u === `${OPENROUTER_BASE}/images`) {
        if (body) mockBodies.push(body);
        return new Response(JSON.stringify({ data: [{ b64_json: RED_PIXEL_B64 }] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: 'test prompt',
    });

    const reqBody = JSON.parse(mockBodies[0]);
    expect(reqBody.image).toBeUndefined();
    expect(result).toMatch(/^data:image\/\w+;base64,/);
  });
});

describe('openrouterService.generateImageWithMeta — composite de logo + formato (normalizePixels)', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
  });
  afterEach(() => { process.env.OPENROUTER_API_KEY = origKey; });

  function mockFetchWithLogo() {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        return new Response(JSON.stringify({ data: [{ b64_json: RED_PIXEL_B64 }] }), { status: 200 });
      }
      if (u === 'https://cdn.fury.app/logo.png') {
        const buf = Buffer.from(BLUE_PIXEL_B64, 'base64');
        return new Response(buf, { status: 200, headers: { 'content-type': 'image/png' } });
      }
      return new Response('not found', { status: 404 });
    });
  }

  async function dimensionsOf(dataUrl: string) {
    const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    return sharp(Buffer.from(match![1], 'base64')).metadata();
  }

  it('com normalizePixels=true e aspect_ratio=9:16, o composite final (imagem + logo) sai em 1080x1920 — bug corrigido', async () => {
    mockFetchWithLogo();

    const { dataUrl } = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: 'test prompt',
      logoUrl: 'https://cdn.fury.app/logo.png',
      aspect_ratio: '9:16',
      normalizePixels: true,
    });

    const meta = await dimensionsOf(dataUrl);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('teste de regressão: sem normalizePixels (comportamento de hoje), com logo, continua saindo 1080x1080 fixo', async () => {
    mockFetchWithLogo();

    const { dataUrl } = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: 'test prompt',
      logoUrl: 'https://cdn.fury.app/logo.png',
    });

    const meta = await dimensionsOf(dataUrl);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it('teste de regressão: aspect_ratio=9:16 SEM normalizePixels (caso do Planejador IA hoje), com logo, continua 1080x1080 — bug preservado de propósito fora do escopo desta spec', async () => {
    mockFetchWithLogo();

    const { dataUrl } = await openrouterService.generateImageWithMeta({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: 'test prompt',
      logoUrl: 'https://cdn.fury.app/logo.png',
      aspect_ratio: '9:16',
    });

    const meta = await dimensionsOf(dataUrl);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });
});
