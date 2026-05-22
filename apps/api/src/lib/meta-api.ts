import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

const META_API_VERSION = 'v20.0';
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'fury-default-key';
const ALGORITHM = 'aes-256-cbc';

export function decryptAccessToken(encryptedToken: string): string {
  try {
    if (encryptedToken.length < 50) {
      throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Token criptografado invalido: formato desconhecido.');
    }

    const [ivHex, encryptedHex] = encryptedToken.split(':');
    if (!ivHex || !encryptedHex) {
      throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Token criptografado invalido: componentes ausentes.');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Falha ao descriptografar token Meta.');
  }
}

export function encryptAccessToken(token: string): string {
  const iv = randomBytes(16);
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

interface MetaApiErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

export interface MetaAdAccountsResponse {
  data: MetaAdAccount[];
}

interface MetaUserProfileResponse {
  id: string;
}

function mapMetaErrorMessage(payload: MetaApiErrorPayload, fallback: string): string {
  const code = payload.error?.code;
  const message = payload.error?.message;

  if (code === 190) {
    return 'Meta token invalido ou expirado.';
  }

  if (code === 200 || code === 10) {
    return 'Permissao negada no app Meta. Verifique ads_read, ads_management e business_management.';
  }

  return message || fallback;
}

async function parseMetaResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const message = mapMetaErrorMessage((payload || {}) as MetaApiErrorPayload, fallbackMessage);
    throw new AppError(response.status, 'META_API_ERROR', message, {
      status: response.status,
      metaError: payload,
    });
  }

  return (payload || {}) as T;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<MetaTokenResponse> {
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('client_secret', params.clientSecret);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code', params.code);

  const response = await fetch(url, { method: 'GET' });
  return parseMetaResponse<MetaTokenResponse>(response, 'Falha ao trocar o code por access token no Meta.');
}

export async function exchangeForLongLivedToken(params: {
  clientId: string;
  clientSecret: string;
  shortLivedToken: string;
}): Promise<MetaTokenResponse> {
  const url = new URL(`${META_GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('client_secret', params.clientSecret);
  url.searchParams.set('fb_exchange_token', params.shortLivedToken);

  const response = await fetch(url, { method: 'GET' });
  return parseMetaResponse<MetaTokenResponse>(
    response,
    'Falha ao obter token de longa duracao (60 dias) no Meta.'
  );
}

export async function getUserAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/adaccounts`);
  url.searchParams.set('fields', 'id,name,account_status,currency');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET' });
  const payload = await parseMetaResponse<MetaAdAccountsResponse>(
    response,
    'Falha ao buscar contas de anuncios no Meta.'
  );

  return payload.data || [];
}

export async function getMetaUserId(accessToken: string): Promise<string> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'id');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET' });
  const payload = await parseMetaResponse<MetaUserProfileResponse>(
    response,
    'Falha ao buscar o id do usuario Meta.'
  );

  if (!payload.id) {
    throw new AppError(502, 'META_API_ERROR', 'Meta nao retornou o id do usuario autenticado.');
  }

  return payload.id;
}

export interface MetaInsightsAction {
  action_type: string;
  value: number | string;
}

export interface MetaInsightsData {
  date_start?: string;
  date_stop?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  actions?: MetaInsightsAction[];
  action_values?: MetaInsightsAction[];
  purchase_roas?: MetaInsightsAction[];
  cost_per_action_type?: MetaInsightsAction[];
}

export interface MetaInsightsResponse {
  data: MetaInsightsData[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

type MetaApiErrorPayload2 = {
  error?: {
    code?: number;
    message?: string;
    type?: string;
    error_subcode?: number;
  };
};

type MetaApiError = Error & {
  metaCode?: number;
};

export async function metaApiCall<T>(
  path: string,
  accessToken: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
  }
): Promise<T> {
  const isMocked = (accessToken.toLowerCase().includes('mock') ||
                   process.env.META_API_MOCK === 'true') &&
                   !accessToken.startsWith('EAAC');

  if (isMocked) {
    const method = options?.method || 'GET';

    if (method === 'POST' && path.includes('/adimages')) {
      return { images: { 'fury_upload': { hash: `mock_hash_${Date.now()}` } } } as T;
    }

    if (method === 'POST' && path.includes('/campaigns')) {
      return {
        id: `meta_campaign_${Date.now()}`,
      } as T;
    }

    if (method === 'POST' && path.match(/^\/[a-zA-Z0-9_-]+$/)) {
      return { success: true } as T;
    }

    if (method === 'GET') {
      const pathNoQuery = path.split('?')[0] || path;
      if (pathNoQuery.includes('/insights')) {
        return {
          data: [
            {
              date_start: '2024-06-01',
              date_stop: '2024-06-01',
              spend: '100.5',
              impressions: '10000',
              clicks: '250',
              actions: [{ action_type: 'purchase', value: '10' }],
              action_values: [{ action_type: 'purchase', value: '500' }],
              purchase_roas: [{ action_type: 'omni_purchase', value: '3.45' }],
              cost_per_action_type: [{ action_type: 'purchase', value: '12.50' }],
              campaign_id: 'mock_campaign_1',
              campaign_name: 'Mock Campaign',
            },
          ],
        } as T;
      }
      if (pathNoQuery.includes('/adsets')) {
        return {
          data: [
            {
              id: 'mock_adset_1',
              name: 'Mock Ad Set',
              status: 'ACTIVE',
              daily_budget: '50000',
              insights: {
                data: [
                  {
                    spend: '120.50',
                    clicks: '400',
                    ctr: '2.5',
                    cpm: '15.2',
                  },
                ],
              },
            },
          ],
        } as T;
      }

      return {
        id: pathNoQuery.replace(/^\//, '').split('/')[0],
        status: 'ACTIVE',
        name: 'Mock Campaign',
        objective: 'OUTCOME_SALES',
      } as T;
    }
  }

  const url = new URL(`${META_GRAPH_BASE_URL}${path}`);
  url.searchParams.set('access_token', accessToken);

  const fetchOptions: RequestInit = {
    method: options?.method || 'GET',
    headers: { Accept: 'application/json' },
  };

  if (options?.body) {
    fetchOptions.headers = { ...fetchOptions.headers, 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOptions);
  const json = (await res.json()) as unknown;

  const maybeErr = json as MetaApiErrorPayload2;
  if (!res.ok || maybeErr?.error) {
    const code = maybeErr?.error?.code;
    const message = maybeErr?.error?.message || (typeof json === 'object' ? JSON.stringify(json) : String(json));
    const err = new Error(`[Meta API] ${code ?? res.status}: ${message}`);
    (err as MetaApiError).metaCode = code;
    throw err;
  }

  return json as T;
}

export type MetaCampaignResponse = {
  id: string;
  name?: string;
  status?: string;
  daily_budget?: number;
  objective?: string;
};

export type MetaCampaignCreateResponse = {
  id: string;
};

export async function getMetaInsights(params: {
  accessToken: string;
  /** Conta de anúncios (ex.: act_123). Usado quando `entityId` não é informado. */
  adAccountId?: string;
  /** Objeto Meta (campanha, conjunto, etc.) para `/{id}/insights`. */
  entityId?: string;
  startDate: string;
  endDate: string;
  timeIncrement?: number;
  /** Nível de agregação (ex.: campaign para listagem por campanha). */
  level?: 'account' | 'campaign' | 'adset' | 'ad';
}): Promise<MetaInsightsResponse> {
  const objectId = params.entityId ?? params.adAccountId;
  if (!objectId) {
    throw new AppError(400, 'META_INSIGHTS_ID', 'Informe adAccountId ou entityId para insights.');
  }

  const path = `/${objectId}/insights`;
  const fields = [
    'spend',
    'impressions',
    'clicks',
    'ctr',
    'cpm',
    'actions',
    'action_values',
    'purchase_roas',
    'cost_per_action_type',
    'date_start',
    'date_stop',
    'campaign_id',
    'campaign_name',
  ].join(',');
  const timeRange = JSON.stringify({ since: params.startDate, until: params.endDate });

  let fullPath = `${path}?fields=${fields}&time_range=${encodeURIComponent(timeRange)}`;

  if (params.level) {
    fullPath += `&level=${params.level}`;
  }

  if (params.timeIncrement) {
    fullPath += `&time_increment=${params.timeIncrement}`;
  }

  return metaApiCall<MetaInsightsResponse>(fullPath, params.accessToken);
}

export interface MetaAdImageUploadResponse {
  images: Record<string, { hash: string; url?: string }>;
}

export async function uploadAdImage(params: {
  adAccountId: string;
  base64: string;
  filename: string;
  accessToken: string;
}): Promise<string> {
  const response = await metaApiCall<MetaAdImageUploadResponse>(
    `/${encodeURIComponent(params.adAccountId)}/adimages`,
    params.accessToken,
    {
      method: 'POST',
      body: { bytes: params.base64, name: params.filename },
    }
  );

  const imageData = Object.values(response.images)[0];
  if (!imageData?.hash) {
    throw new AppError(502, 'META_IMAGE_UPLOAD_FAILED', 'Meta nao retornou hash da imagem enviada.');
  }

  return imageData.hash;
}
