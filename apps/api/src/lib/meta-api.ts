import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

const META_API_VERSION = 'v20.0';
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[FURY] ${name} env var is required`);
  return value;
}

const ENCRYPTION_KEY = requireEnv('TOKEN_ENCRYPTION_KEY');
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
  timezone_name: string;
}

export interface MetaAdAccountsResponse {
  data: MetaAdAccount[];
}

export interface MetaBusiness {
  id: string;
  name: string;
}

interface MetaBusinessesResponse {
  data: MetaBusiness[];
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

export async function getUserBusinesses(accessToken: string): Promise<MetaBusiness[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/businesses`);
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET' });
  const payload = await parseMetaResponse<MetaBusinessesResponse>(
    response,
    'Falha ao buscar Business Managers no Meta.'
  );

  return payload.data || [];
}

export async function getBusinessAdAccounts(businessId: string, accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${businessId}/owned_ad_accounts`);
  url.searchParams.set('fields', 'id,name,account_status,currency,timezone_name');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET' });
  const payload = await parseMetaResponse<MetaAdAccountsResponse>(
    response,
    'Falha ao buscar contas de anuncios da Business Manager no Meta.'
  );

  return payload.data || [];
}

async function getPersonalAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/me/adaccounts`);
  url.searchParams.set('fields', 'id,name,account_status,currency,timezone_name');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { method: 'GET' });
  const payload = await parseMetaResponse<MetaAdAccountsResponse>(
    response,
    'Falha ao buscar contas de anuncios no Meta.'
  );

  return payload.data || [];
}

/**
 * Retorna apenas as contas de anuncio das Business Managers concedidas no escopo do OAuth
 * (via /me/businesses + /{business_id}/owned_ad_accounts). Caso o usuario nao tenha BMs
 * (contas pessoais), faz fallback para /me/adaccounts.
 */
export async function getUserAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const businesses = await getUserBusinesses(accessToken);

  if (businesses.length === 0) {
    return getPersonalAdAccounts(accessToken);
  }

  const accountsByBusiness = await Promise.all(
    businesses.map((business) => getBusinessAdAccounts(business.id, accessToken))
  );

  const seen = new Set<string>();
  const accounts: MetaAdAccount[] = [];
  for (const list of accountsByBusiness) {
    for (const account of list) {
      if (!seen.has(account.id)) {
        seen.add(account.id);
        accounts.push(account);
      }
    }
  }

  return accounts;
}

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY';
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramMediaListResponse {
  data: InstagramMediaItem[];
}

interface InstagramAccountsResponse {
  data: Array<{ id: string; instagram_business_account?: { id: string } }>;
}

interface InstagramInsightsResponse {
  data: Array<{ name: string; values: Array<{ value: number }> }>;
}

/** Busca o ID da conta comercial do Instagram vinculada a alguma Pagina do Facebook do usuario. */
export async function getInstagramBusinessAccountId(accessToken: string): Promise<string> {
  const response = await metaApiCall<InstagramAccountsResponse>(
    '/me/accounts?fields=instagram_business_account',
    accessToken
  );

  const igUserId = (response.data || []).find((page) => page.instagram_business_account?.id)
    ?.instagram_business_account?.id;

  if (!igUserId) {
    throw new AppError(
      404,
      'INSTAGRAM_ACCOUNT_NOT_FOUND',
      'Nenhuma conta do Instagram Business encontrada vinculada à sua página do Facebook. Configure em Configurações do Instagram.'
    );
  }

  return igUserId;
}

/** Busca os ultimos posts do Instagram de uma conta comercial. */
export async function getInstagramMedia(igUserId: string, accessToken: string): Promise<InstagramMediaItem[]> {
  const response = await metaApiCall<InstagramMediaListResponse>(
    `/${igUserId}/media?fields=id,caption,media_url,thumbnail_url,media_type,media_product_type,timestamp,like_count,comments_count&limit=20`,
    accessToken
  );

  return response.data || [];
}

export interface InstagramMediaInsights {
  reach: number;
  saved: number;
  shares: number;
  replies: number;
}

// Metrica usada como "alcance": Reels nao expoe `reach`, mas expoe `plays`.
const METRIC_FIELD_MAP: Record<string, keyof InstagramMediaInsights> = {
  reach: 'reach',
  plays: 'reach',
  saved: 'saved',
  shares: 'shares',
  replies: 'replies',
};

/**
 * Busca metricas de um post do Instagram, uma de cada vez, para isolar
 * metricas indisponiveis para o tipo de midia (ex.: `reach` nao existe em
 * Reels, `replies` so existe em stories). Metricas que falharem ficam em 0.
 */
export async function getInstagramMediaInsights(
  mediaId: string,
  accessToken: string,
  mediaProductType?: InstagramMediaItem['media_product_type']
): Promise<InstagramMediaInsights> {
  const insights: InstagramMediaInsights = { reach: 0, saved: 0, shares: 0, replies: 0 };

  const reachMetric = mediaProductType === 'REELS' ? 'plays' : 'reach';
  const metricsToFetch = [reachMetric, 'saved', 'shares', 'replies'];

  for (const metric of metricsToFetch) {
    try {
      const response = await metaApiCall<InstagramInsightsResponse>(
        `/${mediaId}/insights?metric=${metric}`,
        accessToken
      );

      for (const item of response.data || []) {
        const field = METRIC_FIELD_MAP[item.name];
        if (field) {
          insights[field] = item.values?.[0]?.value ?? 0;
        }
      }
    } catch (err) {
      console.warn(
        `[Instagram] /${mediaId}/insights?metric=${metric} indisponivel:`,
        (err as Error).message
      );
    }
  }

  return insights;
}

export interface InstagramAccountInsights {
  comments: number;
  saves: number;
  followerChange: number;
}

interface InstagramTotalValueInsightsResponse {
  data: Array<{ name: string; total_value?: { value: number } }>;
}

interface InstagramTimeSeriesInsightsResponse {
  data: Array<{ name: string; period: string; values: Array<{ value: number; end_time?: string }> }>;
}

/** Busca metricas organicas da conta (comentarios, salvamentos e variacao de seguidores) no periodo informado (since/until no formato YYYY-MM-DD). */
export async function getInstagramAccountInsights(
  igUserId: string,
  accessToken: string,
  since: string,
  until: string
): Promise<InstagramAccountInsights> {
  const insights: InstagramAccountInsights = { comments: 0, saves: 0, followerChange: 0 };

  try {
    const totals = await metaApiCall<InstagramTotalValueInsightsResponse>(
      `/${igUserId}/insights?metric=comments,saved&metric_type=total_value&period=day&since=${since}&until=${until}`,
      accessToken
    );

    for (const item of totals.data || []) {
      if (item.name === 'comments') insights.comments = item.total_value?.value ?? 0;
      if (item.name === 'saved') insights.saves = item.total_value?.value ?? 0;
    }
  } catch (err) {
    console.warn('[Instagram] account insights (comments/saved) indisponivel:', (err as Error).message);
  }

  try {
    const followers = await metaApiCall<InstagramTimeSeriesInsightsResponse>(
      `/${igUserId}/insights?metric=follower_count&period=day&since=${since}&until=${until}`,
      accessToken
    );

    const values = followers.data?.[0]?.values ?? [];
    if (values.length >= 2) {
      const first = values[0]?.value ?? 0;
      const last = values[values.length - 1]?.value ?? 0;
      insights.followerChange = last - first;
    }
  } catch (err) {
    console.warn('[Instagram] account insights (follower_count) indisponivel:', (err as Error).message);
  }

  return insights;
}

export interface MetaFacebookPage {
  pageId: string;
  name: string;
  hasWhatsApp: boolean;
}

interface MetaPagesResponse {
  data: Array<{ id: string; name?: string; whatsapp_business_account?: { id: string } }>;
}

/** Lista as Paginas do Facebook do usuario (/me/accounts), marcando as que tem WABA vinculada. */
export async function getUserFacebookPages(accessToken: string): Promise<MetaFacebookPage[]> {
  const response = await metaApiCall<MetaPagesResponse>(
    '/me/accounts?fields=id,name,whatsapp_business_account&limit=100',
    accessToken
  );

  return (response.data || []).map((page) => ({
    pageId: page.id,
    name: page.name ?? page.id,
    hasWhatsApp: Boolean(page.whatsapp_business_account?.id),
  }));
}

export interface MetaWhatsappNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
}

interface MetaWabaPhoneNumbersResponse {
  data: Array<{ id: string; display_phone_number?: string; verified_name?: string }>;
}

/**
 * Lista os numeros WhatsApp Business vinculados a uma Pagina, via WABA da pagina
 * (/{page-id}?fields=whatsapp_business_account -> /{waba-id}/phone_numbers).
 * Pagina sem WhatsApp vinculado retorna lista vazia (nao erro).
 */
export async function getPageWhatsappNumbers(
  pageId: string,
  accessToken: string
): Promise<MetaWhatsappNumber[]> {
  const page = await metaApiCall<{ id: string; whatsapp_business_account?: { id: string } }>(
    `/${encodeURIComponent(pageId)}?fields=whatsapp_business_account`,
    accessToken
  );

  const wabaId = page.whatsapp_business_account?.id;
  if (!wabaId) {
    return [];
  }

  const numbers = await metaApiCall<MetaWabaPhoneNumbersResponse>(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
    accessToken
  );

  return (numbers.data || []).map((number) => ({
    phoneNumberId: number.id,
    displayPhoneNumber: number.display_phone_number ?? '',
    verifiedName: number.verified_name ?? '',
  }));
}

interface MetaPermissionsResponse {
  data: Array<{ permission: string; status: 'granted' | 'declined' | 'expired' }>;
}

/** Busca os escopos OAuth concedidos pelo usuario (GET /me/permissions). */
export async function getUserPermissions(accessToken: string): Promise<string[]> {
  const response = await metaApiCall<MetaPermissionsResponse>('/me/permissions', accessToken);

  return (response.data || [])
    .filter((permission) => permission.status === 'granted')
    .map((permission) => permission.permission);
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
  cpc?: string;
  actions?: MetaInsightsAction[];
  unique_actions?: MetaInsightsAction[];
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
  metaType?: string;
  httpStatus?: number;
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

    if (method === 'POST' && path.includes('/adcreatives')) {
      return {
        id: `meta_adcreative_${Date.now()}`,
      } as T;
    }

    if (method === 'POST' && path.match(/^\/[a-zA-Z0-9_-]+$/)) {
      return { success: true } as T;
    }

    if (method === 'GET') {
      const pathNoQuery = path.split('?')[0] || path;
      if (pathNoQuery.includes('/me/permissions')) {
        return {
          data: [
            { permission: 'ads_read', status: 'granted' },
            { permission: 'ads_management', status: 'granted' },
            { permission: 'business_management', status: 'granted' },
            { permission: 'pages_show_list', status: 'granted' },
            { permission: 'pages_read_engagement', status: 'granted' },
            { permission: 'instagram_basic', status: 'granted' },
            { permission: 'instagram_manage_insights', status: 'granted' },
          ],
        } as T;
      }
      if (pathNoQuery.includes('/me/accounts')) {
        return {
          data: [
            {
              id: 'mock_page_id',
              name: 'Página Demo FURY',
              instagram_business_account: { id: 'mock_ig_user_id' },
              whatsapp_business_account: { id: 'mock_waba_id' },
            },
          ],
        } as T;
      }
      if (pathNoQuery.includes('/phone_numbers')) {
        return {
          data: [
            {
              id: 'mock_phone_number_id',
              display_phone_number: '+55 11 99999-0000',
              verified_name: 'FURY Demo',
            },
          ],
        } as T;
      }
      if (path.includes('fields=whatsapp_business_account')) {
        return {
          id: pathNoQuery.replace(/^\//, ''),
          whatsapp_business_account: { id: 'mock_waba_id' },
        } as T;
      }
      if (path.includes('metric_type=total_value')) {
        return {
          data: [
            { name: 'comments', total_value: { value: 18 } },
            { name: 'saved', total_value: { value: 37 } },
          ],
        } as T;
      }
      if (path.includes('metric=follower_count')) {
        return {
          data: [
            {
              name: 'follower_count',
              period: 'day',
              values: [
                { value: 1200, end_time: '1970-01-01T00:00:00+0000' },
                { value: 1242, end_time: '1970-01-02T00:00:00+0000' },
              ],
            },
          ],
        } as T;
      }
      if (path.includes('/insights?metric=')) {
        const metric = path.split('metric=')[1]?.split('&')[0];
        const mockValues: Record<string, number> = {
          reach: 1500,
          plays: 2200,
          saved: 45,
          shares: 22,
          replies: 6,
        };
        return {
          data: [{ name: metric, period: 'lifetime', values: [{ value: mockValues[metric ?? ''] ?? 0 }] }],
        } as T;
      }
      if (pathNoQuery.endsWith('/media')) {
        return {
          data: [
            {
              id: 'mock_media_1',
              caption: 'Confira nossa promoção especial deste mês! Aproveite enquanto dura.',
              media_url: 'https://placehold.co/600x600?text=Post+1',
              thumbnail_url: 'https://placehold.co/600x600?text=Post+1',
              media_type: 'IMAGE',
              media_product_type: 'FEED',
              timestamp: new Date(Date.now() - 86400000).toISOString(),
              like_count: 120,
              comments_count: 14,
            },
            {
              id: 'mock_media_2',
              caption: 'Bastidores do nosso atendimento de hoje.',
              media_url: 'https://placehold.co/600x600?text=Post+2',
              thumbnail_url: 'https://placehold.co/600x600?text=Post+2',
              media_type: 'IMAGE',
              media_product_type: 'FEED',
              timestamp: new Date(Date.now() - 172800000).toISOString(),
              like_count: 60,
              comments_count: 4,
            },
          ],
        } as T;
      }
      if (pathNoQuery.includes('/search')) {
        return {
          data: [
            { key: '2421217', name: 'São Paulo', region: 'São Paulo (state)', country_code: 'BR', type: 'city' },
            { key: '2406246', name: 'Rio de Janeiro', region: 'Rio de Janeiro (state)', country_code: 'BR', type: 'city' },
          ],
        } as T;
      }
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
    const subcode = maybeErr?.error?.error_subcode;
    const type = maybeErr?.error?.type;
    const message = maybeErr?.error?.message || (typeof json === 'object' ? JSON.stringify(json) : String(json));
    console.error('[Meta API] Error response:', {
      path,
      status: res.status,
      code,
      subcode,
      type,
      message,
    });
    const err = new Error(`[Meta API] ${code ?? res.status}: ${message}`);
    (err as MetaApiError).metaCode = code;
    (err as MetaApiError).metaType = type;
    (err as MetaApiError).httpStatus = res.status;
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
    'cpc',
    'actions',
    'unique_actions',
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

export interface MetaAdCreativeCreateResponse {
  id: string;
}

function mapCtaToMetaType(rawCta: string): string {
  const cta = rawCta.trim().toLowerCase();
  if (!cta) return 'LEARN_MORE';
  if (cta.includes('compr')) return 'SHOP_NOW';
  if (cta.includes('cadast') || cta.includes('inscrev')) return 'SIGN_UP';
  if (cta.includes('contat') || cta.includes('fale')) return 'CONTACT_US';
  if (cta.includes('baix')) return 'DOWNLOAD';
  return 'LEARN_MORE';
}

export async function createAdCreativeFromCopy(params: {
  adAccountId: string;
  accessToken: string;
  headline: string;
  primaryText: string;
  cta: string;
  pageId: string;
  linkUrl: string;
  imageHash?: string;
}): Promise<string> {
  const callToActionType = mapCtaToMetaType(params.cta);

  const body: Record<string, unknown> = {
    name: `FURY Copy Creative ${new Date().toISOString()}`,
    object_story_spec: {
      page_id: params.pageId,
      link_data: {
        message: params.primaryText,
        name: params.headline,
        link: params.linkUrl,
        call_to_action: {
          type: callToActionType,
          value: { link: params.linkUrl },
        },
      },
    },
  };

  if (params.imageHash) {
    ((body.object_story_spec as any).link_data as any).image_hash = params.imageHash;
  }

  const response = await metaApiCall<MetaAdCreativeCreateResponse>(
    `/${encodeURIComponent(params.adAccountId)}/adcreatives`,
    params.accessToken,
    {
      method: 'POST',
      body,
    }
  );

  if (!response?.id) {
    throw new AppError(502, 'META_AD_CREATIVE_FAILED', 'Meta nao retornou id do ad creative.');
  }

  return response.id;
}

export interface MetaLocationResult {
  key: string;
  name: string;
  region?: string;
  country_code?: string;
  type?: string;
}

interface MetaLocationSearchResponse {
  data: MetaLocationResult[];
}

/** Remove sufixos de desambiguação ("(state)", "(country)") que a Meta retorna no campo region. */
function cleanRegionLabel(region?: string): string | undefined {
  if (!region) return undefined;
  const cleaned = region.replace(/\s*\((state|country)\)\s*/gi, '').trim();
  return cleaned || undefined;
}

/** Busca localizacoes (cidades) do Brasil via Meta Graph API para uso no targeting de campanhas. */
export async function searchMetaCityLocations(query: string, accessToken: string): Promise<MetaLocationResult[]> {
  const path = `/search?type=adgeolocation&location_types=${encodeURIComponent(JSON.stringify(['city']))}&country_codes=${encodeURIComponent(JSON.stringify(['BR']))}&q=${encodeURIComponent(query)}`;
  const response = await metaApiCall<MetaLocationSearchResponse>(path, accessToken);
  return (response.data || [])
    .filter((item) => item.type === 'city' && item.country_code === 'BR')
    .map((item) => ({ ...item, region: cleanRegionLabel(item.region) }));
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
