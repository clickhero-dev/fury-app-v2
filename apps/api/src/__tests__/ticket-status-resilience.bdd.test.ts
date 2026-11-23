/**
 * Funcionalidade: consultar status com recuperação limitada
 * Cenário: falha transitória
 * Dado timeout, rede, 429 ou 5xx, quando consulto status,
 * então repete uma vez respeitando Retry-After e o orçamento de 7 segundos.
 * Cenário: resposta definitiva inválida
 * Dado autenticação recusada ou conteúdo inválido, quando consulto status,
 * então falha sem cache, sem segredos e sem repetir.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUpTicketsClient } from '../lib/clickup-tickets.client.js';
const client = () => new ClickUpTicketsClient({ apiToken: 'secret', listId: 'list' });
const ok = () => new Response(JSON.stringify({ statuses: [{ status: 'triagem', type: 'open' }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('consulta resiliente de status', () => {
  it.each([429, 500, 502, 503])('recupera de %s respeitando Retry-After', async (status) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status, headers: { 'Retry-After': '1' } })).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch);
    const result = client().listStatuses();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual([{ value: 'triagem', label: 'triagem', type: 'open' }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].signal).toBeDefined();
  });
  it.each(['TimeoutError', 'TypeError'])('recupera de %s', async (name) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new DOMException('secret', name)).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch);
    const result = client().listStatuses();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('não repete antes de Retry-After além do orçamento', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().listStatuses()).rejects.toMatchObject({ code: 'CLICKUP_RATE_LIMITED', providerStatus: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404])('não repete resposta definitiva %s', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response('secret', { status }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().listStatuses()).rejects.toMatchObject({ providerStatus: status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { statuses: [null] }, { statuses: [] }, { statuses: [{ status: '', type: 'open' }] }])('recusa payload inválido %j sem fallback', async (body) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    vi.stubGlobal('fetch', fetch);
    await expect(client().listStatuses()).rejects.toMatchObject({ code: 'CLICKUP_INVALID_RESPONSE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['invalid', new Date(Date.now() - 5000).toUTCString()])('trata Retry-After inválido ou passado %s', async (retryAfter) => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': retryAfter } })).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch);
    const result = client().listStatuses();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('respeita Retry-After como data HTTP', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T00:00:00Z'));
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': 'Tue, 17 Nov 2026 00:00:02 GMT' } })).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetch);
    const result = client().listStatuses();
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toHaveLength(1);
  });
  it('recusa JSON malformado sem retry', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('not json'));
    vi.stubGlobal('fetch', fetch);
    await expect(client().listStatuses()).rejects.toMatchObject({ code: 'CLICKUP_INVALID_RESPONSE' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('encerra timeouts persistentes em duas tentativas e menos de sete segundos', async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const started = Date.now();
    await expect(client().listStatuses()).rejects.toMatchObject({ code: 'CLICKUP_TIMEOUT' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(7000);
  });
  it('limita falhas persistentes a duas tentativas', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const result = expect(client().listStatuses()).rejects.toMatchObject({ code: 'CLICKUP_UNAVAILABLE', providerStatus: 503 });
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
