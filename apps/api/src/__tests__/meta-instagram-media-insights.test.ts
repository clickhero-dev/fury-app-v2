import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstagramMediaInsights } from '../lib/meta-api.js';

describe('getInstagramMediaInsights', () => {
  const originalFetch = globalThis.fetch;
  const originalMock = process.env.META_API_MOCK;

  beforeEach(() => {
    process.env.META_API_MOCK = 'false';
    globalThis.fetch = vi.fn(async (input: string) => {
      const url = new URL(input);
      const metric = url.searchParams.get('metric');
      if (metric === 'plays' || (metric === 'replies' && !url.pathname.includes('story'))) {
        return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: 'unsupported metric' } }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ name: metric, values: [{ value: 7 }] }] }),
      } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalMock === undefined) delete process.env.META_API_MOCK;
    else process.env.META_API_MOCK = originalMock;
    vi.restoreAllMocks();
  });

  it('consulta apenas métricas válidas para mídia de feed', async () => {
    const result = await getInstagramMediaInsights('feed', 'token', 'FEED');
    const metrics = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]: [string]) => new URL(url).searchParams.get('metric'));
    expect(metrics).toEqual(['reach', 'saved', 'shares']);
    expect(result).toEqual({ reach: 7, saved: 7, shares: 7, replies: 0 });
  });

  it('não consulta plays nem replies para Reels', async () => {
    const result = await getInstagramMediaInsights('reel', 'token', 'REELS');
    const metrics = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]: [string]) => new URL(url).searchParams.get('metric'));
    expect(metrics).toEqual(['reach', 'saved', 'shares']);
    expect(result.reach).toBe(7);
  });

  it('consulta replies para stories e conserva zero quando uma métrica é indisponível', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: string) => ({
      ok: new URL(input).searchParams.get('metric') !== 'saved',
      status: new URL(input).searchParams.get('metric') === 'saved' ? 400 : 200,
      json: async () => new URL(input).searchParams.get('metric') === 'saved'
        ? { error: { code: 100, message: 'unsupported metric' } }
        : { data: [{ name: new URL(input).searchParams.get('metric'), values: [{ value: 7 }] }] },
    } as Response));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getInstagramMediaInsights('story', 'token', 'STORY');
    const metrics = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]: [string]) => new URL(url).searchParams.get('metric'));
    expect(metrics).toContain('replies');
    expect(result).toEqual({ reach: 7, saved: 0, shares: 7, replies: 7 });
  });
});
