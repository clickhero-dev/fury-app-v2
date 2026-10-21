/**
 * Testes de contrato do cliente Google Ads API (v18+) — Fluxo 3 (promoção do GBP).
 *
 * Valida URLs, métodos e payloads EXATOS do mecanismo atual de Location assets
 * (substituiu os feed services, deprecados):
 *  - MutateAssetSets: AssetSet{type: LOCATION_SYNC, locationSet{locationOwnershipType,
 *    businessProfileLocationSet{emailAddress, httpAuthorizationToken}}}
 *  - MutateCustomerAssetSets: attach no customer (gera os location assets)
 *  - MutateCampaigns + MutateCampaignBudgets: campanha c/ verba mensal → daily budget
 *  - GoogleAdsService.SearchStream: status de veiculação (campaign, asset_set)
 *
 * Mocks: GOOGLE_ADS_API_MOCK=true → fixtures determinísticas, sem HTTP real.
 * Em GOOGLE_ADS_API_MOCK=false, as rotas apontam para googleads.googleapis.com/v18.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

import { createGoogleAdsApiClient } from '../lib/google-ads-api.js';
import type { GoogleAdsCampaignInput } from '../lib/google-ads-api.js';

const GOOGLE_ADS_BASE = 'https://googleads.googleapis.com/v18';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client() {
  return createGoogleAdsApiClient({
    developerToken: 'dev-token-test',
    customerId: '1234567890',
    accessToken: 'ya29.ads-fake',
  });
}

const lastCall = () => {
  const calls = fetchMock.mock.calls;
  const [url, init] = calls.at(-1) as [string, RequestInit];
  return { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined };
};

describe('google-ads-api v18 — URLs e payloads', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_ADS_API_MOCK', 'false');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mutateAssetSets cria AssetSet LOCATION_SYNC com BusinessProfileLocationSet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/1234567890/assetSets/111' }] }));
    const result = await client().mutateAssetSets({
      emailAddress: 'dono@empresa.com.br',
      httpAuthorizationToken: 'Bearer ya29.gbp-token',
      assetSetName: 'Ady - Minha Empresa Ltda',
    });
    const call = lastCall();
    expect(call.url).toBe(`${GOOGLE_ADS_BASE}/customers/1234567890/assetSets:mutate`);
    expect(call.body.operations[0].create.type).toBe('LOCATION_SYNC');
    expect(call.body.operations[0].create.locationSet.locationOwnershipType).toBe('BUSINESS_OWNER');
    expect(call.body.operations[0].create.locationSet.businessProfileLocationSet).toMatchObject({
      emailAddress: 'dono@empresa.com.br',
      httpAuthorizationToken: 'Bearer ya29.gbp-token',
    });
    expect(result.assetSetId).toBe(111);
  });

  it('mutateCustomerAssetSets attacha o asset set no customer (ENABLED)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/1234567890/customerAssetSets/111' }] }));
    await client().mutateCustomerAssetSets('customers/1234567890/assetSets/111');
    const call = lastCall();
    expect(call.url).toBe(`${GOOGLE_ADS_BASE}/customers/1234567890/customerAssetSets:mutate`);
    expect(call.body.operations[0].create.assetSet).toBe('customers/1234567890/assetSets/111');
    expect(call.body.operations[0].create.status).toBe('ENABLED');
  });

  it('cria budget + campanha com percentual diário da verba mensal (mensal/30.4)', async () => {
    const campaignInput: GoogleAdsCampaignInput = {
      name: 'Ady - Promoção Google - Empresa',
      monthlyBudgetBRL: 300,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/555' }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ resourceName: 'customers/1234567890/campaigns/999' }] }));

    const result = await client().mutateCampaign(campaignInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [budgetCall, campaignCall] = fetchMock.mock.calls as Array<[string, RequestInit]>;

    // Budget: R$ 300/mês → R$ 9.86/dia → 9_863_013 micros (arredondado)
    const budgetBody = JSON.parse(budgetCall[1].body as string) as {
      operations: Array<{ create: { amountMicros: number; name: string; explicitlyShared?: boolean } }>;
    };
    const amount = budgetBody.operations[0].create.amountMicros;
    expect(amount).toBeGreaterThanOrEqual(9_800_000);
    expect(amount).toBeLessThanOrEqual(9_900_000);
    expect(budgetBody.operations[0].create).toHaveProperty('name');
    expect(budgetBody.operations[0].create.explicitlyShared).toBe(false);

    const campaignBody = JSON.parse(campaignCall[1].body as string) as {
      operations: Array<{ create: { budget: string; advertisingChannelType: string } }>;
    };
    expect(campaignBody.operations[0].create.budget).toContain('campaignBudgets/555');
    expect(campaignBody.operations[0].create.advertisingChannelType).toBe('SEARCH');
  });

  it('searchStream consulta status de veiculação', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            results: [
              { campaign: { id: '999', status: 'ENABLED' }, customerAssetSet: { assetSet: 'customers/1/assetSets/111', status: 'ENABLED' } },
            ],
          },
        ],
      })
    );
    const rows = await client().searchStream(
      'SELECT campaign.id, campaign.status, customer_asset_set.asset_set, customer_asset_set.status FROM campaign'
    );
    const call = lastCall();
    expect(call.url).toBe(`${GOOGLE_ADS_BASE}/customers/1234567890/googleAds:searchStream`);
    expect(call.body.query).toContain('SELECT campaign.id');
    expect(rows[0]?.campaign?.status).toBe('ENABLED');
  });

  it('usa GOOGLE_ADS_API_MOCK=true sem HTTP real', async () => {
    vi.stubEnv('GOOGLE_ADS_API_MOCK', 'true');
    const mockClient = createGoogleAdsApiClient({ customerId: '1234567890' });
    const assetSet = await mockClient.mutateAssetSets({
      emailAddress: 'dono@empresa.com.br',
      httpAuthorizationToken: 'Bearer x',
    });
    expect(assetSet.assetSetId).toBeGreaterThan(0);
    const campaign = await mockClient.mutateCampaign({ name: 'Mock', monthlyBudgetBRL: 300 });
    expect(campaign.campaignId).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});