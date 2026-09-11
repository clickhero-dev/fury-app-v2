import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * T10a — Paginação de insights da Meta (feature 014).
 * getMetaInsights paginado: >100 linhas (100 campanhas × 1 dia, ou límite
 * de linha do Graph) são seguidas via cursor `after` até esgotar `next`.
 * fetch global mockado (fronteira HTTP).
 */

const fetchMock = vi.fn();

function makePage(rows: any[], next?: string, after?: string) {
  return {
    data: rows,
    paging: {
      cursors: after ? { before: 'b', after } : undefined,
      ...(next ? { next } : {}),
    },
  };
}

const row = (campaignId: string) => ({
  campaign_id: campaignId,
  campaign_name: `Camp ${campaignId}`,
  date_start: '2026-09-01',
  date_stop: '2026-09-01',
  spend: '10.00',
  impressions: '100',
  clicks: '10',
  actions: [],
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMetaInsights paginado', () => {
  it('segue cursor `after` e acumula todas as páginas (>100 linhas)', async () => {
    const { getMetaInsights } = await import('../lib/meta-api.js');

    const page1 = Array.from({ length: 100 }, (_, i) => row(`c${i}`));
    const page2 = Array.from({ length: 100 }, (_, i) => row(`c${i + 100}`));
    const page3 = [row('c200')];

    fetchMock
      .mockResolvedValueOnce(jsonResponse(makePage(page1, 'https://graph.facebook.com/v23.0/next?page=2', 'cursor-1')))
      .mockResolvedValueOnce(jsonResponse(makePage(page2, 'https://graph.facebook.com/v23.0/next?page=3', 'cursor-2')))
      .mockResolvedValueOnce(jsonResponse(makePage(page3)));

    const res = await getMetaInsights({
      accessToken: 'tok',
      adAccountId: 'act_1',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      level: 'campaign',
      timeIncrement: 1,
    });

    expect(res.data).toHaveLength(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 2ª chamada deve carregar o cursor
    const secondUrl = String(fetchMock.mock.calls[1]![0].url ?? fetchMock.mock.calls[1]![0]);
    expect(secondUrl).toContain('after=cursor-1');
  });

  it('para quando não há `next` (página única — comportamento atual)', async () => {
    const { getMetaInsights } = await import('../lib/meta-api.js');
    fetchMock.mockResolvedValueOnce(jsonResponse(makePage([row('c1')])));

    const res = await getMetaInsights({
      accessToken: 'tok',
      adAccountId: 'act_1',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });

    expect(res.data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('safety: para após 10 páginas mesmo se `next` nunca terminar (loop guard)', async () => {
    const { getMetaInsights } = await import('../lib/meta-api.js');
    // sempre devolve página com next — loop infinito potencial
    fetchMock.mockImplementation(async () =>
      jsonResponse(makePage([row(`c${fetchMock.mock.calls.length}`)], 'https://graph.facebook.com/v23.0/next', `c-${fetchMock.mock.calls.length}`))
    );

    const res = await getMetaInsights({
      accessToken: 'tok',
      adAccountId: 'act_1',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(10);
    expect(res.data.length).toBeLessThanOrEqual(10);
  });
});
