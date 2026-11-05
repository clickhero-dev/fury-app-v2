// # Language: pt-BR
// Funcionalidade: extrair telemetria de quota Meta sem expor tokens ou payloads.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaApiCall, parseMetaUsageHeaders } from '../lib/meta-api.js';

describe('parseMetaUsageHeaders', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('lê os headers oficiais de uso em formato JSON', () => {
    const headers = new Headers({
      'X-App-Usage': JSON.stringify({ call_count: 20, total_cputime: 8 }),
      'X-Ad-Account-Usage': JSON.stringify({ acc_id_util_pct: 31 }),
      'X-Business-Use-Case-Usage': JSON.stringify({ '123': [{ call_count: 10 }] }),
    });
    expect(parseMetaUsageHeaders(headers)).toEqual({
      app: { call_count: 20, total_cputime: 8 },
      adAccount: { acc_id_util_pct: 31 },
      businessUseCase: { '123': [{ call_count: 10 }] },
    });
  });

  it('ignora header ausente ou JSON inválido', () => {
    expect(parseMetaUsageHeaders(new Headers({ 'X-App-Usage': 'invalid' }))).toEqual({});
  });

  it('preserva usage headers na exceção de throttling sem incluir token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 17, message: 'User request limit reached' } }),
      { status: 400, headers: { 'X-Ad-Account-Usage': JSON.stringify({ acc_id_util_pct: 91 }) } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(metaApiCall('/act_123/insights', 'secret-token'))
      .rejects.toMatchObject({ metaCode: 17, rateLimitUsage: { adAccount: { acc_id_util_pct: 91 } } });
    expect(fetchMock.mock.calls[0][0]).toContain('access_token=secret-token');
  });
});
