/**
 * Testes de contrato do cliente GBP migrado para a stack v1 (2026).
 *
 * Valida URLs, métodos HTTP e payloads EXATOS da API v1:
 *  - Account Management: mybusinessaccountmanagement.googleapis.com/v1
 *  - Business Information: mybusinessbusinessinformation.googleapis.com/v1
 *  - Verifications: mybusinessverifications.googleapis.com/v1
 *
 * Diferenças críticas vs v4 (deprecada):
 *  - readMask OBRIGATÓRIO em locations.list/get
 *  - googleLocations:search → POST /googleLocations:search (resposta googleLocations)
 *  - fetchVerificationOptions → POST (era GET)
 *  - getVoiceOfMerchantState → GET /{name}/VoiceOfMerchantState (novo endpoint)
 *  - categories: regionCode+languageCode+view obrigatórios; query vira filter
 *  - name de location no formato locations/{id} (normaliza accounts/x/locations/y)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

import { createGoogleApiClient } from '../lib/google-api.js';
import type { GbpLocation, GbpLocationMatch } from '../lib/google-api.js';

const ACCOUNT_MGMT = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const VERIFICATIONS = 'https://mybusinessverifications.googleapis.com/v1';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client() {
  return createGoogleApiClient({
    accessToken: 'ya29.fake',
    tokenExpiresAt: new Date(Date.now() + 3600_000),
  });
}

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe('google-api v1 — URLs e payloads', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_API_MOCK', 'false');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('listAccounts chama Account Management v1', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accounts: [{ name: 'accounts/42', accountName: 'Loja' }] }));
    const accounts = await client().listAccounts();
    const call = lastCall();
    expect(call.url).toBe(`${ACCOUNT_MGMT}/accounts`);
    expect(call.method).toBe('GET');
    expect(accounts[0]?.accountName).toBe('Loja');
  });

  it('listLocations exige readMask e pagina', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          locations: [{ name: 'locations/789', title: 'Loja' }],
          nextPageToken: 'tok-1',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ locations: [] }));
    const locations = await client().listLocations('accounts/42');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const call = lastCall();
    expect(call.url).toContain(`${BIZ_INFO}/accounts/42/locations`);
    expect(call.url).toContain('readMask=');
    expect(locations.length).toBe(1);
  });

  it('searchGoogleLocations usa POST /googleLocations:search e mapeia googleLocations', async () => {
    const googleLocation: GbpLocationMatch = {
      locationName: 'locations/789',
      placeId: 'ChIJx',
      location: { name: 'locations/789', title: 'Loja' },
      requestAdminRightsUrl: 'https://business.google.com/claim/xyz',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ googleLocations: [googleLocation] }));
    const matches = await client().searchGoogleLocations({
      location: { title: 'Loja', address: { addressLines: ['Rua A'], regionCode: 'BR' } },
      languageCode: 'pt-BR',
      pageSize: 3,
    });
    const call = lastCall();
    expect(call.url).toBe(`${BIZ_INFO}/googleLocations:search`);
    expect(call.method).toBe('POST');
    expect(call.body.location).toMatchObject({ title: 'Loja' });
    expect(call.body.pageSize).toBe(3);
    expect(matches[0]?.requestAdminRightsUrl).toBe('https://business.google.com/claim/xyz');
  });

  it('getLocation normaliza name v4 → v1 e exige readMask', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: 'locations/789', title: 'Loja' }));
    const loc = await client().getLocation('accounts/42/locations/789');
    const call = lastCall();
    expect(call.url).toContain(`${BIZ_INFO}/locations/789`);
    expect(call.url).toContain('readMask=');
    expect(loc.title).toBe('Loja');
  });

  it('patchLocation usa PATCH com updateMask', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ name: 'locations/789', title: 'Loja 2' }));
    const loc = await client().patchLocation('locations/789', { title: 'Loja 2' }, ['title']);
    const call = lastCall();
    expect(call.url).toContain(`${BIZ_INFO}/locations/789`);
    expect(call.url).toContain('updateMask=title');
    expect(call.method).toBe('PATCH');
    expect(loc.title).toBe('Loja 2');
  });

  it('fetchVerificationOptions é POST na v1', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ options: [{ verificationMethod: 'EMAIL' }] }));
    const options = await client().fetchVerificationOptions('locations/789');
    const call = lastCall();
    expect(call.url).toBe(`${VERIFICATIONS}/locations/789:fetchVerificationOptions`);
    expect(call.method).toBe('POST');
    expect(options[0]?.verificationMethod).toBe('EMAIL');
  });

  it('verifyLocation envia method + languageCode', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ verification: { state: 'PENDING' } }));
    await client().verifyLocation('locations/789', 'EMAIL');
    const call = lastCall();
    expect(call.url).toBe(`${VERIFICATIONS}/locations/789:verify`);
    expect(call.method).toBe('POST');
    expect(call.body).toMatchObject({ method: 'EMAIL', languageCode: 'pt-BR' });
  });

  it('listVerifications GET no host Verifications', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ verifications: [{ state: 'PENDING' }] }));
    await client().listVerifications('locations/789');
    const call = lastCall();
    expect(call.url).toBe(`${VERIFICATIONS}/locations/789/verifications`);
    expect(call.method).toBe('GET');
  });

  it('getVoiceOfMerchantState chama GET /VoiceOfMerchantState', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hasVoiceOfMerchant: true, hasBusinessAuthority: true }));
    const state = await client().getVoiceOfMerchantState('locations/789');
    const call = lastCall();
    expect(call.url).toBe(`${VERIFICATIONS}/locations/789/VoiceOfMerchantState`);
    expect(call.method).toBe('GET');
    expect(state.hasVoiceOfMerchant).toBe(true);
  });

  it('listCategories usa regionCode+languageCode+view e query vira filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ categories: [{ categoryId: 'gcid:bakery', displayName: 'Padaria' }] }));
    const categories = await client().listCategories({ query: 'pad', regionCode: 'BR', pageSize: 20 });
    const call = lastCall();
    expect(call.url).toContain(`${BIZ_INFO}/categories`);
    expect(call.url).toContain('regionCode=BR');
    expect(call.url).toContain('languageCode=pt-BR');
    expect(call.url).toContain('view=BASIC');
    expect(call.url).toContain('filter=displayName%3Dpad');
    expect(categories[0]?.categoryId).toBe('gcid:bakery');
  });
});