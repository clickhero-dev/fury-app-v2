import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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