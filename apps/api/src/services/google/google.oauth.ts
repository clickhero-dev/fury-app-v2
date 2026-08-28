/**
 * Helpers do fluxo OAuth do Google Meu Negócio.
 * Movidos de google.service.ts (refatoração de modularização): assinatura/
 * verificação do state JWT, allowlist de origens do frontend e identificação
 * do usuário Google (id_token ou userinfo).
 */
import jwt from 'jsonwebtoken';
import { AppError } from '../../middleware/errorHandler.js';
import { GOOGLE_ERROR_CODES } from '../../schemas/google.schemas.js';
import type { OAuthContext } from './google.types.js';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// openid/email/profile são necessários para o Google devolver o `id_token`
// (sub do usuário) na troca do code — sem eles o userinfo responde 401/403.
export const GOOGLE_OAUTH_SCOPE =
  'openid email https://www.googleapis.com/auth/business.manage';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface OAuthStatePayload {
  tenantId: string;
  context: OAuthContext;
  frontendUrl?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

export const RETURN_URLS: Record<OAuthContext, string> = {
  onboarding: '/onboarding/conectar-google?connected=true',
  settings: '/configuracoes/google-meu-negocio?connected=true',
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(500, GOOGLE_ERROR_CODES.MISSING_ENV, `Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const secret = getRequiredEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '10m' });
}

/**
 * Origens de frontend aceitas para o redirect pós-OAuth.
 * Sempre inclui o origin vindo da REQUISIÇÃO (browser) — o fluxo NÃO depende
 * de configuração: qualquer origin http(s) válido é aceito por padrão.
 * Restrições opcionais (hardening):
 * - ALLOWED_FRONTEND_ORIGINS='*' → libera tudo (default implícito);
 * - ALLOWED_FRONTEND_ORIGINS='a,b' → só as listadas;
 * - ausente → qualquer http(s).
 */
export function getAllowedFrontendOrigins(): string[] {
  const explicit = process.env.ALLOWED_FRONTEND_ORIGINS
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  // Sem configuração explícita: libera qualquer origin http(s).
  return ['*'];
}

export function isAllowedFrontendOrigin(origin: string): boolean {
  const allowed = getAllowedFrontendOrigins();
  if (allowed.includes('*')) {
    return isHttpOrigin(origin);
  }
  return allowed.includes(origin);
}

export function isHttpOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  try {
    const secret = getRequiredEnv('JWT_SECRET');
    return jwt.verify(state, secret) as OAuthStatePayload;
  } catch {
    throw new AppError(401, GOOGLE_ERROR_CODES.INVALID_OAUTH_STATE, 'State OAuth invalido ou expirado.');
  }
}

export function getTokenExpiration(expiresIn: number): Date | null {
  if (!expiresIn || expiresIn <= 0) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000);
}

export async function resolveGoogleUserId(tokenResponse: GoogleTokenResponse): Promise<string> {
  if (tokenResponse.id_token) {
    const decoded = jwt.decode(tokenResponse.id_token) as { sub?: string } | null;
    if (decoded?.sub) {
      return decoded.sub;
    }
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      502,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED,
      'Falha ao identificar o usuário Google após a autenticação.'
    );
  }

  if (!response.ok) {
    // 401/403 do userinfo = token sem escopo openid (o Google não devolveu
    // id_token). Diagnóstico explícito para o erro reportado em produção.
    const reason = response.status === 401 || response.status === 403 ? 'SCOPE_INSUFFICIENT' : 'USERINFO_FAILED';
    throw new AppError(
      502,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED,
      'Falha ao identificar o usuário Google após a autenticação.',
      { reason, status: response.status }
    );
  }

  const payload = (await response.json()) as { sub?: string };
  if (!payload.sub) {
    throw new AppError(
      502,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED,
      'Falha ao identificar o usuário Google após a autenticação.'
    );
  }
  return payload.sub;
}