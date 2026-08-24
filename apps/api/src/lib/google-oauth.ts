import { AppError } from '../middleware/errorHandler.js';
import { GOOGLE_ERROR_CODES } from '../schemas/google.schemas.js';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  token_type?: string;
  scope?: string;
}

interface GoogleOAuthErrorPayload {
  error?: string;
  error_description?: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(500, GOOGLE_ERROR_CODES.MISSING_ENV, `Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

let cachedConfig: GoogleOAuthConfig | null = null;

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  if (!cachedConfig) {
    cachedConfig = {
      clientId: getRequiredEnv('GOOGLE_CLIENT_ID'),
      clientSecret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      redirectUri: getRequiredEnv('GOOGLE_REDIRECT_URI'),
    };
  }
  return cachedConfig;
}

export function isGoogleApiMockEnabled(): boolean {
  return process.env.GOOGLE_API_MOCK === 'true';
}

async function parseTokenResponse(response: Response, fallbackMessage: string): Promise<GoogleTokenResponse> {
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse & GoogleOAuthErrorPayload;

  if (!response.ok) {
    const message = payload.error_description || payload.error || fallbackMessage;
    throw new AppError(response.status, GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED, message, {
      googleError: payload.error,
      status: response.status,
    });
  }

  if (!payload.access_token) {
    throw new AppError(502, GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED, fallbackMessage);
  }

  return payload;
}

export async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED, 'Falha de rede ao trocar o code por token no Google.');
  }

  return parseTokenResponse(response, 'Falha na troca do code por access token no Google.');
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  let response: Response;
  try {
    response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      401,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXPIRED,
      'Sua conexão com o Google expirou. Reconecte para continuar.'
    );
  }

  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse & GoogleOAuthErrorPayload;

  if (!response.ok || !payload.access_token) {
    throw new AppError(
      401,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXPIRED,
      'Sua conexão com o Google expirou. Reconecte para continuar.',
      { googleError: payload.error, status: response.status }
    );
  }

  return payload;
}

export async function revokeGoogleToken(accessToken: string): Promise<void> {
  const body = new URLSearchParams({ token: accessToken });

  try {
    await fetch(GOOGLE_OAUTH_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Revogacao best-effort: nao deve bloquear a desconexao local.
  }
}