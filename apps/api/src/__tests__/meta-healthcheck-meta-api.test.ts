// =============================================================================
// BDD — Calls read-only Meta usadas pelo healthcheck
/*
# Language: pt-BR

Funcionalidade: Validar token Meta com timeout e erros controlados

  Cenário: identidade válida usa chamada externa com signal de timeout
    Dado token Meta válido
    Quando busco o usuário autenticado
    Então retorna o id e envia AbortSignal à chamada externa

  Cenário: Meta informa token vencido
    Dado Graph API responde código OAuth 190
    Quando valido o token
    Então retorna código client-safe META_TOKEN_EXPIRED

  Cenário: timeout de rede é identificado sem expor URL ou credenciais
    Dado a chamada externa excede o timeout
    Quando valido o token
    Então o erro é classificado como TIMEOUT
*/
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMetaUserId } from '../lib/meta-api.js';

describe('BDD: chamadas de validação da Meta', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Cenário: /me responde e recebe signal com timeout', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: 'meta-user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMetaUserId('fake-token')).resolves.toBe('meta-user');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('Cenário: código 190 retorna erro de token vencido client-safe', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, type: 'OAuthException', message: 'invalid token payload' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMetaUserId('fake-token')).rejects.toMatchObject({ code: 'META_TOKEN_EXPIRED' });
  });

  it('Cenário: erro de timeout vem do wrapper externo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); }));

    await expect(getMetaUserId('fake-token')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
