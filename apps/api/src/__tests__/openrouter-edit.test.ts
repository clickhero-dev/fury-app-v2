import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { persistOpenRouterImageResponse } from '../lib/openrouter-image-response.js';

// Regeneração de imagem usa SOMENTE OpenRouter (sem OpenAI). O módulo é mockado
// para isolar o teste em construção do request + mapeamento de erros, sem I/O de disco.
vi.mock('../lib/openrouter-image-response.js', () => ({
  persistOpenRouterImageResponse: vi.fn(),
}));

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const mockedPersist = vi.mocked(persistOpenRouterImageResponse);

describe('openrouterService.editImage — regeneração via OpenRouter (sem OpenAI)', () => {
  const origKey = process.env.OPENROUTER_API_KEY;
  let bodies: string[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.restoreAllMocks();
    bodies = [];
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u === `${OPENROUTER_BASE}/chat/completions`) {
          bodies.push(typeof init?.body === 'string' ? init.body : String(init?.body ?? ''));
          return new Response('{}', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      },
    );
  });
  afterEach(() => {
    process.env.OPENROUTER_API_KEY = origKey;
  });

  it('envia a imagem pelo OpenRouter e usa o model de edição de imagem (sem OpenAI)', async () => {
    mockedPersist.mockResolvedValue('https://cdn.fury.app/edited.png');

    const result = await openrouterService.editImage({
      imageUrl: 'https://img.fury.app/ads.png',
      instructions: 'remova o texto',
    });

    const req = JSON.parse(bodies[0]);
    expect(req.model).toBe('google/gemini-3.1-flash-image');
    const parts = req.messages[0].content;
    expect(parts[0].image_url.url).toBe('https://img.fury.app/ads.png');
    expect(parts[1].text).toContain('remova o texto');
    expect(result).toBe('https://cdn.fury.app/edited.png');
  });

  it('inclui a máscara como segunda imagem quando maskImageUrl é informada', async () => {
    mockedPersist.mockResolvedValue('https://cdn.fury.app/edited.png');

    await openrouterService.editImage({
      imageUrl: 'https://img.fury.app/ads.png',
      instructions: 'troque o fundo',
      maskImageUrl: 'data:image/png;base64,AAAA',
    });

    const req = JSON.parse(bodies[0]);
    const parts = req.messages[0].content;
    expect(parts).toHaveLength(3);
    expect(parts[1].image_url.url).toBe('data:image/png;base64,AAAA');
    expect(parts[2].text).toContain('máscara');
  });

  it('lança IMAGE_EDIT_EMPTY (502) quando o modelo não retorna imagem', async () => {
    mockedPersist.mockRejectedValue(new Error('Model did not return an image'));

    await expect(
      openrouterService.editImage({ imageUrl: 'https://img.fury.app/ads.png', instructions: 'x' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'IMAGE_EDIT_EMPTY' });
  });

  it('lança IMAGE_EDIT_ERROR quando o OpenRouter responde != 2xx', async () => {
    mockedPersist.mockResolvedValue('https://cdn.fury.app/x.png');
    fetchSpy.mockImplementation(async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/chat/completions`) {
        return new Response('provider down', { status: 503 });
      }
      return new Response('nf', { status: 404 });
    });

    await expect(
      openrouterService.editImage({ imageUrl: 'https://img.fury.app/ads.png', instructions: 'x' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'IMAGE_EDIT_ERROR' });
  });
});