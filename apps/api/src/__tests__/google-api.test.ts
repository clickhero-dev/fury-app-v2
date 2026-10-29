/*
# Language: pt-BR

Funcionalidade: comunicar com Google Business Profile API v1

  Cenário: listar contas que a pessoa autorizou
    Dado um token OAuth válido
    Quando o app consulta as contas do Perfil da Empresa
    Então chama o endpoint Account Management v1

  Cenário: listar os perfis administrados por uma conta
    Dado uma conta do Perfil da Empresa
    Quando o app consulta suas localizações
    Então chama o endpoint Business Information v1 com readMask
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoogleApiClient } from '../lib/google-api.js';

describe('GoogleApiClient — Google Business Profile v1', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_API_MOCK', 'false');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lista contas pelo endpoint Account Management v1', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accounts: [{ name: 'accounts/123', accountName: 'Empresa' }] }), { status: 200 }),
    );
    const client = createGoogleApiClient({ accessToken: 'oauth-token' });

    await expect(client.listAccounts()).resolves.toEqual([
      { name: 'accounts/123', accountName: 'Empresa' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('mybusinessaccountmanagement.googleapis.com/v1/accounts'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer oauth-token' }),
      }),
    );
  });

  it('lista localizações pelo endpoint Business Information v1 com readMask', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ locations: [{ name: 'locations/789', title: 'Perfil existente' }] }), { status: 200 }),
    );
    const client = createGoogleApiClient({ accessToken: 'oauth-token' });

    await expect(client.listLocations('accounts/123')).resolves.toEqual([
      { name: 'locations/789', title: 'Perfil existente' },
    ]);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations');
    expect(url).toContain('readMask=');
  });

  it('mantém a verificação funcional no mock usando POST como a API v1 exige', async () => {
    vi.stubEnv('GOOGLE_API_MOCK', 'true');
    const client = createGoogleApiClient({ accessToken: 'oauth-token' });

    await expect(client.fetchVerificationOptions('locations/789')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ verificationMethod: expect.any(String) }),
      ]),
    );
  });

  it('classifica 429 como indisponibilidade temporária do Google', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 }),
    );
    const client = createGoogleApiClient({ accessToken: 'oauth-token' });

    await expect(client.listAccounts()).rejects.toMatchObject({
      statusCode: 429,
      code: 'GOOGLE_QUOTA_EXCEEDED',
    });
  });
});
