import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UazapiClient, UazapiError } from '../lib/uazapi-client.js';

const savedEnv = { ...process.env };

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Status',
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('UazapiClient', () => {
  beforeEach(() => {
    process.env.UAZAPI_BASE_URL = 'https://free.uazapi.com';
    process.env.UAZAPI_INSTANCE_TOKEN = 'inst-token-123';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  describe('config', () => {
    it('lança UazapiError MISSING_CONFIG quando env ausente (na chamada)', async () => {
      delete process.env.UAZAPI_BASE_URL;
      const client = new UazapiClient();
      const err = await client.checkNumber('5511999999999').catch((e) => e);
      expect(err).toBeInstanceOf(UazapiError);
      expect(err.code).toBe('MISSING_CONFIG');
    });

    it('aceita baseUrl sem barra final', () => {
      expect(() => new UazapiClient({ baseUrl: 'https://x.uazapi.com/', instanceToken: 't' })).not.toThrow();
    });
  });

  describe('checkNumber', () => {
    it('retorna true quando isInWhatsapp === true (happy path)', async () => {
      const fetchMock = mockFetchOnce(200, [{ query: '5511999999999', jid: 'x@s.whatsapp.net', isInWhatsapp: true }]);
      const client = new UazapiClient();
      await expect(client.checkNumber('5511999999999')).resolves.toBe(true);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://free.uazapi.com/chat/check');
      expect((init as RequestInit).method).toBe('POST');
      expect(((init as RequestInit).headers as Record<string, string>).token).toBe('inst-token-123');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ numbers: ['5511999999999'] });
    });

    it('retorna false quando isInWhatsapp === false', async () => {
      mockFetchOnce(200, [{ query: '5511999999999', isInWhatsapp: false }]);
      const client = new UazapiClient();
      await expect(client.checkNumber('5511999999999')).resolves.toBe(false);
    });

    it('retorna false quando lista vem vazia (número sem conta no WA)', async () => {
      mockFetchOnce(200, []);
      const client = new UazapiClient();
      await expect(client.checkNumber('5511999999999')).resolves.toBe(false);
    });

    it('lança UazapiError com status em resposta 4xx/5xx', async () => {
      mockFetchOnce(500, { error: 'boom' });
      const client = new UazapiClient();
      const err = await client.checkNumber('5511999999999').catch((e) => e);
      expect(err).toBeInstanceOf(UazapiError);
      expect(err.status).toBe(500);
    });

    it('lança UazapiError 502 em falha de rede', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const client = new UazapiClient();
      const err = await client.checkNumber('5511999999999').catch((e) => e);
      expect(err).toBeInstanceOf(UazapiError);
      expect(err.status).toBe(502);
    });
  });

  describe('sendText', () => {
    it('envia POST /send/text com number e text', async () => {
      const fetchMock = mockFetchOnce(200, { id: 'true' });
      const client = new UazapiClient();
      await expect(client.sendText('5511999999999', 'Seu código: 123456')).resolves.toBeUndefined();
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://free.uazapi.com/send/text');
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        number: '5511999999999',
        text: 'Seu código: 123456',
      });
    });

    it('lança UazapiError quando a uazapi devolve erro', async () => {
      mockFetchOnce(400, { error: 'not connected' });
      const client = new UazapiClient();
      const err = await client.sendText('5511999999999', 'oi').catch((e) => e);
      expect(err).toBeInstanceOf(UazapiError);
      expect(err.status).toBe(400);
    });
  });
});
