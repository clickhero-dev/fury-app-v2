import { AppError } from '../middleware/errorHandler.js';

/**
 * Cliente REST da Google Ads API (v18) — Fluxo 3 (promoção do GBP).
 *
 * Mecanismo atual (feed services estão DEPRECADOS): **Location assets**.
 *
 * Fluxo:
 *  1. mutateAssetSets → AssetSet{type: LOCATION_SYNC} com
 *     LocationSet.businessProfileLocationSet{emailAddress, httpAuthorizationToken}
 *     (token = OAuth `business.manage` da conta DONA do perfil GBP — SEM isso, 401)
 *  2. mutateCustomerAssetSets → attach no customer → a API gera os location assets
 *  3. mutateCampaignBudget + mutateCampaign → campanha SEARCH com orçamento diário
 *     (`amount_micros` = verba mensal / 30.4 — padrão "average daily budget")
 *  4. searchStream → status de veiculação (campaign.status, customer_asset_set.status)
 *
 * Mock: GOOGLE_ADS_API_MOCK=true → fixtures determinísticas sem HTTP real
 * (espelha GOOGLE_API_MOCK da GBP). Requer developer token + aprovação
 * Advanced Access no Google Ads API Center para uso real.
 */
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com/v18';
const REQUEST_TIMEOUT_MS = 15_000;

export class GoogleAdsApiError extends AppError {
  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(statusCode, code, message, details);
  }
}

export interface GoogleAdsApiDeps {
  developerToken?: string;
  customerId?: string;
  accessToken?: string;
}

export interface AssetSetInput {
  emailAddress: string;
  /** OAuth `business.manage` da conta dona do perfil GBP (Bearer ...). */
  httpAuthorizationToken: string;
  assetSetName?: string;
}

export interface GoogleAdsCampaignInput {
  name: string;
  /** Verba mensal em BRL — convertida para orçamento médio diário (mensal / 30.4). */
  monthlyBudgetBRL: number;
}

export interface GoogleAdsCampaignResult {
  campaignId: number;
  budgetId: number;
}

interface MutateResponse {
  results?: Array<{ resourceName?: string }>;
}

interface SearchStreamRow {
  results?: Array<Record<string, unknown>>;
}

interface SearchResponse {
  results?: SearchStreamRow[];
}

/** Converte verba mensal (BRL) → amount_micros diário do Google Ads. */
export function monthlyBudgetToDailyMicros(monthlyBRL: number): number {
  if (monthlyBRL <= 0) {
    throw new GoogleAdsApiError(400, 'VALIDATION_ERROR', 'A verba mensal deve ser maior que zero.');
  }
  const dailyBRL = monthlyBRL / 30.4;
  return Math.round(dailyBRL * 1_000_000);
}

/** Extrai o ID numérico final de um resourceName (customers/1/campaigns/999 → 999). */
export function extractResourceId(resourceName: string): number {
  const match = resourceName.match(/\/(\d+)$/);
  if (!match) {
    throw new GoogleAdsApiError(500, 'GOOGLE_ADS_API_ERROR', `ResourceName inválido: ${resourceName}`);
  }
  return Number(match[1]);
}

interface GoogleAdsErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ errors?: Array<{ message?: string; errorCode?: Record<string, string> }> }>;
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

const MOCK_RESOURCE_BASE_ID = 111_001;

export function createGoogleAdsApiClient(deps: GoogleAdsApiDeps) {
  const isMock = process.env.GOOGLE_ADS_API_MOCK === 'true';
  const developerToken = deps.developerToken;
  const customerId = deps.customerId;
  const accessToken = deps.accessToken;

  function missingTokenError(): GoogleAdsApiError {
    return new GoogleAdsApiError(
      401,
      'GOOGLE_ADS_TOKEN_MISSING',
      'Credenciais do Google Ads não configuradas. Configure GOOGLE_ADS_DEVELOPER_TOKEN e conecte a conta Ads.'
    );
  }

  async function mockMutateResource<T>(path: string, _body: unknown, baseId: number): Promise<T> {
    const resourceName = `customers/${customerId ?? '0'}/${path.split('/')[0].replace(/s$/, '')}s/${baseId}`;
    return { results: [{ resourceName }] } as T;
  }

  async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
    if (!developerToken || !customerId || !accessToken) {
      throw missingTokenError();
    }

    const url = new URL(`${GOOGLE_ADS_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const fetchOptions: RequestInit = {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': customerId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(url.toString(), fetchOptions);
      payload = await response.json().catch(() => ({}));
    } catch {
      throw new GoogleAdsApiError(
        502,
        'GOOGLE_ADS_API_ERROR',
        `Falha de rede ao chamar a Google Ads API (${path}).`
      );
    }

    if (!response.ok) {
      const errorPayload = payload as GoogleAdsErrorPayload;
      const googleMessage = errorPayload?.error?.details?.[0]?.errors?.[0]?.message;
      const message =
        googleMessage ||
        errorPayload?.error?.message ||
        `Erro da Google Ads API (${response.status}) ao chamar ${path}.`;
      throw new GoogleAdsApiError(response.status, 'GOOGLE_ADS_API_ERROR', message, {
        googleError: errorPayload?.error ?? null,
        path,
      });
    }

    return payload as T;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (isMock) return mockMutateResource<T>(path, options.body ?? {}, MOCK_RESOURCE_BASE_ID);
    return rawRequest<T>(path, options);
  }

  return {
    /**
     * Cria o AssetSet LOCATION_SYNC que sincroniza os locais do GBP com o Google Ads.
     */
    async mutateAssetSets(input: AssetSetInput): Promise<{ assetSetId: number; resourceName: string }> {
      const path = `/customers/${customerId ?? '0'}/assetSets:mutate`;
      const body = {
        operations: [
          {
            create: {
              name: input.assetSetName ?? 'Ady - Google Business Profile',
              type: 'LOCATION_SYNC',
              locationSet: {
                locationOwnershipType: 'BUSINESS_OWNER',
                businessProfileLocationSet: {
                  emailAddress: input.emailAddress,
                  httpAuthorizationToken: input.httpAuthorizationToken,
                },
              },
            },
          },
        ],
      };

      const response = await request<MutateResponse>(path, { method: 'POST', body });
      const resourceName = response.results?.[0]?.resourceName ?? '';
      return { assetSetId: extractResourceId(resourceName), resourceName };
    },

    /**
     * Attacha o AssetSet ao customer — a API gera automaticamente os location assets.
     */
    async mutateCustomerAssetSets(assetSetResourceName: string): Promise<{ resourceName: string }> {
      const path = `/customers/${customerId ?? '0'}/customerAssetSets:mutate`;
      const body = {
        operations: [
          {
            create: {
              assetSet: assetSetResourceName,
              status: 'ENABLED',
            },
          },
        ],
      };

      const response = await request<MutateResponse>(path, { method: 'POST', body });
      return { resourceName: response.results?.[0]?.resourceName ?? '' };
    },

    /**
     * Cria budget (diário = verba mensal / 30.4) + campanha SEARCH.
     */
    async mutateCampaign(input: GoogleAdsCampaignInput): Promise<GoogleAdsCampaignResult> {
      const amountMicros = monthlyBudgetToDailyMicros(input.monthlyBudgetBRL);

      // 1) Budget
      const budgetResponse = await request<MutateResponse>(
        `/customers/${customerId ?? '0'}/campaignBudgets:mutate`,
        {
          method: 'POST',
          body: {
            operations: [
              {
                create: {
                  name: `${input.name} - Budget`,
                  amountMicros,
                  explicitlyShared: false,
                },
              },
            ],
          },
        }
      );
      const budgetResourceName = budgetResponse.results?.[0]?.resourceName ?? '';

      // 2) Campanha SEARCH
      const campaignResponse = await request<MutateResponse>(
        `/customers/${customerId ?? '0'}/campaigns:mutate`,
        {
          method: 'POST',
          body: {
            operations: [
              {
                create: {
                  name: input.name,
                  advertisingChannelType: 'SEARCH',
                  status: 'PAUSED',
                  budget: budgetResourceName,
                },
              },
            ],
          },
        }
      );
      const campaignResourceName = campaignResponse.results?.[0]?.resourceName ?? '';

      return {
        campaignId: extractResourceId(campaignResourceName),
        budgetId: extractResourceId(budgetResourceName),
      };
    },

    /**
     * GoogleAdsService.SearchStream — status de veiculação.
     */
    async searchStream(query: string): Promise<Array<Record<string, unknown>>> {
      const path = `/customers/${customerId ?? '0'}/googleAds:searchStream`;
      const response = await request<SearchResponse>(path, {
        method: 'POST',
        body: { query },
      });
      return (response.results ?? []).flatMap((row) => row.results ?? []);
    },
  };
}

export type GoogleAdsApiClient = ReturnType<typeof createGoogleAdsApiClient>;