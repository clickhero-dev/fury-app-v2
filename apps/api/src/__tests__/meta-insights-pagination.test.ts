// # Language: pt-BR
// Funcionalidade: consumir todas as páginas dos insights account-level.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMetaInsights } from '../lib/meta-api.js';

describe('getMetaInsights pagination', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('segue o cursor e junta as linhas de todas as páginas', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: 'm1', date_start: '2026-09-25' }],
        paging: { cursors: { after: 'cursor-1' } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ campaign_id: 'm2', date_start: '2026-09-25' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMetaInsights({
      accessToken: 'test-token', adAccountId: 'act_123', startDate: '2026-09-25', endDate: '2026-09-26',
      timeIncrement: 1, level: 'campaign',
    });

    expect(result.data.map((row) => row.campaign_id)).toEqual(['m1', 'm2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('after')).toBe('cursor-1');
  });
});
