import { AppError } from '../middleware/errorHandler.js';

const META_GRAPH_BASE_URL = 'https://graph.facebook.com/v20.0';

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
