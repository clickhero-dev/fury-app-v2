import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPageAccessToken } from '../lib/meta-api.js';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com/v25.0';

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    headers: { get: () => 'application/json' },
    json: async () => payload,
  } as unknown as Response;
}

describe('meta-api getPageAccessToken', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('retorna access_token + tasks da Página (admin direto)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'page_1', name: 'Página 1', access_token: 'pt1', tasks: ['ADVERTISE', 'MANAGE'] },
        ],
      })
    );

    const result = await getPageAccessToken('user_tok', 'page_1');

    expect(result).toEqual({
      pageId: 'page_1', name: 'Página 1', accessToken: 'pt1', tasks: ['ADVERTISE', 'MANAGE'],
    });
    const url = (globalThis.fetch as any).mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/v25.0/me/accounts');
    expect(url.searchParams.get('fields')).toContain('access_token');
    expect(url.searchParams.get('fields')).toContain('tasks');
  });

  it('cobre Página acessada via Business Manager (aparece em /me/accounts com business_management)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      jsonResponse({
        data: [
          { id: 'page_bm', name: 'Página BM', access_token: 'pt_bm', tasks: ['ADVERTISE'] },
        ],
      })
    );

    const result = await getPageAccessToken('user_tok', 'page_bm');
    expect(result?.accessToken).toBe('pt_bm');
    expect(result?.tasks).toEqual(['ADVERTISE']);
  });

  it('percorre paginação até encontrar a Página', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'page_1', name: 'P1', access_token: 'pt1', tasks: [] }],
          paging: { cursors: { after: 'cursor_2' } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'page_2', name: 'P2', access_token: 'pt2', tasks: ['ADVERTISE'] }],
          paging: { cursors: { after: 'cursor_3' } },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'page_3', name: 'P3', access_token: 'pt3', tasks: ['ANALYZE'] }],
        })
      );

    const result = await getPageAccessToken('user_tok', 'page_3');

    expect(result?.accessToken).toBe('pt3');
    expect((globalThis.fetch as any)).toHaveBeenCalledTimes(3);
    const lastUrl = (globalThis.fetch as any).mock.calls[2][0] as URL;
    expect(lastUrl.searchParams.get('after')).toBe('cursor_3');
  });

  it('retorna null quando a Página não está em nenhuma página do /me/accounts', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: 'page_1', name: 'P1', access_token: 'pt1', tasks: [] }],
      })
    );

    const result = await getPageAccessToken('user_tok', 'page_inexistente');
    expect(result).toBeNull();
  });
});