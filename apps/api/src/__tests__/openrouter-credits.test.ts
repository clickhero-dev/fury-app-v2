import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openrouterService, type CreditState } from '../services/llms/openrouter.service.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function mockFetchForAuthKey(responseBody: unknown, init: { status?: number } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u === `${OPENROUTER_BASE}/auth/key`) {
      return new Response(JSON.stringify(responseBody), { status: init.status ?? 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

describe('openrouterService.getCreditState', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    openrouterService.clearCreditCache();
  });
  afterEach(() => {
    process.env.OPENROUTER_API_KEY = origKey;
    openrouterService.clearCreditCache();
    vi.restoreAllMocks();
  });

  it('retorna hasCredits true quando saldo restante (limit - usage) está acima do mínimo', async () => {
    mockFetchForAuthKey({ data: { label: 'k', usage: 10, limit: 100, is_free_tier: false } });

    const state = await openrouterService.getCreditState();

    expect(state.hasCredits).toBe(true);
    expect(state.credits).toBe(90);
    expect(state.checkedAt).toBeTruthy();
  });

  it('retorna hasCredits false quando saldo restante está abaixo do mínimo', async () => {
    mockFetchForAuthKey({ data: { label: 'k', usage: 9.99, limit: 10, is_free_tier: false } });

    const state = await openrouterService.getCreditState();

    expect(state.hasCredits).toBe(false);
    expect(state.credits).toBe(0.01);
  });

  it('trata free tier sem saldo como sem créditos', async () => {
    mockFetchForAuthKey({ data: { label: 'free', usage: 1, limit: 0, is_free_tier: true } });

    const state = await openrouterService.getCreditState();

    expect(state.hasCredits).toBe(false);
    expect(state.isFreeTier).toBe(true);
  });

  it('fail-open (hasCredits true, credits null) quando o fetch de saldo falha/não-autorizado', async () => {
    mockFetchForAuthKey({ error: { message: 'Missing Authentication header', code: 401 } }, { status: 401 });

    const state = await openrouterService.getCreditState();

    expect(state.hasCredits).toBe(true);
    expect(state.credits).toBeNull();
    expect(state.checkedAt).toBeNull();
  });

  it('usa cache e NÃO refaz fetch dentro do TTL', async () => {
    const fetchSpy = mockFetchForAuthKey({ data: { usage: 1, limit: 10, is_free_tier: false } });

    await openrouterService.getCreditState();
    await openrouterService.getCreditState();
    await openrouterService.getCreditState();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('clearCreditCache() força novo fetch', async () => {
    const fetchSpy = mockFetchForAuthKey({ data: { usage: 1, limit: 10, is_free_tier: false } });

    await openrouterService.getCreditState();
    openrouterService.clearCreditCache();
    await openrouterService.getCreditState();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('openrouterService.assertCreditsAvailable', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    openrouterService.clearCreditCache();
  });
  afterEach(() => {
    process.env.OPENROUTER_API_KEY = origKey;
    openrouterService.clearCreditCache();
    vi.restoreAllMocks();
  });

  it('lança AppError 402 OPENROUTER_INSUFFICIENT_CREDITS quando não há créditos', async () => {
    mockFetchForAuthKey({ data: { usage: 9.99, limit: 10, is_free_tier: false } });

    await expect(openrouterService.assertCreditsAvailable()).rejects.toMatchObject({
      statusCode: 402,
      code: 'OPENROUTER_INSUFFICIENT_CREDITS',
    });
  });

  it('não lança quando há créditos', async () => {
    mockFetchForAuthKey({ data: { usage: 1, limit: 10, is_free_tier: false } });

    await expect(openrouterService.assertCreditsAvailable()).resolves.toBeUndefined();
  });
});

describe('openrouterService.generateImage — créditos insuficientes', () => {
  const origKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => { process.env.OPENROUTER_API_KEY = 'test-key'; });
  afterEach(() => {
    process.env.OPENROUTER_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it('lança OpenRouter error 402 amigável em vez de 502 genérico quando resposta tem Insufficient credits', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        return new Response(JSON.stringify({
          error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402, metadata: { limit_source: 'openrouter_credits' } },
        }), { status: 402 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(openrouterService.generateImage({ model: 'black-forest-labs/flux.2-klein-4b', prompt: 'test' }))
      .rejects.toMatchObject({
        statusCode: 402,
        code: 'OPENROUTER_INSUFFICIENT_CREDITS',
      });
  });

  it('mantém 502 genérico para erros NÃO relacionados a crédito', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u === `${OPENROUTER_BASE}/images`) {
        return new Response(JSON.stringify({ error: { message: 'Bad gateway', code: 502 } }), { status: 502 });
      }
      return new Response('not found', { status: 404 });
    });

    await expect(openrouterService.generateImage({ model: 'black-forest-labs/flux.2-klein-4b', prompt: 'test' }))
      .rejects.toMatchObject({
        statusCode: 502,
        code: 'OPENROUTER_IMAGE_ERROR',
      });
  });
});

// Contrato de tipo — mantém CreditState exportado estável
export type CreditStateContract = CreditState;
