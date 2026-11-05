/**
 * Helpers do fluxo OAuth de **login social com Facebook** (autenticação).
 * NÃO tem relação com a integração Meta Ads (`meta.service.ts` / `meta-api.ts`),
 * que pede escopos de negócio e persiste token. Aqui o token do Facebook é usado
 * só para identificar o usuário (`/me`) e descartado.
 *
 * Escopo do login: apenas `public_profile` e `email` (nenhum escopo de negócio).
 */
import crypto from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v23.0';
export const FACEBOOK_OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const HTTP_TIMEOUT_MS = 15_000;

export interface FacebookOAuthConfig {
  appId: string;
  appSecret: string;
}

export interface FacebookUserInfo {
  id: string;
  name?: string;
  email?: string;
}

/**
 * Credenciais do app. Usa `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` e cai para
 * `META_APP_ID` / `META_APP_SECRET` (mesmo app da Meta). Sem cache — barato e
 * mantém testável.
 */
export function getFacebookOAuthConfig(): FacebookOAuthConfig {
  const appId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET;
  if (!appId) {
    throw new AppError(500, 'MISSING_ENV', 'Variavel de ambiente ausente: FACEBOOK_APP_ID (ou META_APP_ID).');
  }
  if (!appSecret) {
    throw new AppError(500, 'MISSING_ENV', 'Variavel de ambiente ausente: FACEBOOK_APP_SECRET (ou META_APP_SECRET).');
  }
  return { appId, appSecret };
}

/** `appsecret_proof` = HMAC-SHA256(access_token, app_secret) em hex. Exigido em toda chamada ao Graph. */
export function appsecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

/** Troca o `code` do OAuth por um access token de usuário (server-side, usa app secret). */
export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; token_type?: string; expires_in?: number }> {
  const { appId, appSecret } = getFacebookOAuthConfig();

  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('code', params.code);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    throw new AppError(502, 'FACEBOOK_TOKEN_EXCHANGE_FAILED', 'Falha de rede ao trocar o code por token no Facebook.');
  }

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!response.ok || !payload.access_token) {
    throw new AppError(
      502,
      'FACEBOOK_TOKEN_EXCHANGE_FAILED',
      payload.error?.message || 'Falha na troca do code por access token no Facebook.',
    );
  }

  return {
    access_token: payload.access_token,
    token_type: payload.token_type,
    expires_in: payload.expires_in,
  };
}

/** Identifica o usuário: `GET /me?fields=id,name,email` com `appsecret_proof`. */
export async function fetchFacebookUserInfo(accessToken: string): Promise<FacebookUserInfo> {
  const { appSecret } = getFacebookOAuthConfig();

  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'id,name,email');
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('appsecret_proof', appsecretProof(accessToken, appSecret));

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    throw new AppError(502, 'FACEBOOK_USERINFO_FAILED', 'Falha ao obter os dados do usuario no Facebook.');
  }

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    email?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.id) {
    throw new AppError(
      502,
      'FACEBOOK_USERINFO_FAILED',
      payload.error?.message || 'Falha ao obter os dados do usuario no Facebook.',
    );
  }

  return { id: String(payload.id), name: payload.name, email: payload.email };
}
