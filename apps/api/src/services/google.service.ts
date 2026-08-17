import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db, googleConnections, businessProfileSettings, tenants } from '../lib/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { GOOGLE_ERROR_CODES } from '../schemas/google.schemas.js';
import { exchangeCodeForToken, getGoogleOAuthConfig, revokeGoogleToken } from '../lib/google-oauth.js';
import {
  createGoogleApiClient,
  type GbpLocation,
  type GbpLocationMatch,
  type GoogleApiClient,
} from '../lib/google-api.js';
import { encryptToken, decryptToken } from '../utils/crypto.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export type OAuthContext = 'onboarding' | 'settings';

interface OAuthStatePayload {
  tenantId: string;
  context: OAuthContext;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

const RETURN_URLS: Record<OAuthContext, string> = {
  onboarding: '/onboarding/conectar-google?connected=true',
  settings: '/configuracoes/google-meu-negocio?connected=true',
};

export interface GoogleConnectionPublic {
  id: string;
  googleUserId: string;
  accountId: string | null;
  accountName: string | null;
  tokenExpiresAt: string;
  connected: boolean;
}

export interface GoogleAccount {
  accountId: string;
  accountName: string;
}

export interface GoogleLookupMatch {
  gbpLocationId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  verificationState: string;
  claimed: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface GoogleLookupResult {
  found: boolean;
  matches: GoogleLookupMatch[];
  duplicateAlert: boolean;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(500, GOOGLE_ERROR_CODES.MISSING_ENV, `Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

function signOAuthState(payload: OAuthStatePayload): string {
  const secret = getRequiredEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '10m' });
}

function verifyOAuthState(state: string): OAuthStatePayload {
  try {
    const secret = getRequiredEnv('JWT_SECRET');
    return jwt.verify(state, secret) as OAuthStatePayload;
  } catch {
    throw new AppError(401, GOOGLE_ERROR_CODES.INVALID_OAUTH_STATE, 'State OAuth invalido ou expirado.');
  }
}

function getTokenExpiration(expiresIn: number): Date | null {
  if (!expiresIn || expiresIn <= 0) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000);
}

async function resolveGoogleUserId(tokenResponse: GoogleTokenResponse): Promise<string> {
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
    throw new AppError(
      502,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED,
      'Falha ao identificar o usuário Google após a autenticação.'
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

/** Gera a URL de autorização OAuth do Google com o state assinado (10m). */
export function generateGoogleAuthUrl(tenantId: string, context: OAuthContext = 'settings'): string {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  const state = signOAuthState({ tenantId, context });

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return authUrl.toString();
}

/** Troca o code por tokens, criptografa e faz upsert (1-por-tenant) em google_connections. */
export async function handleGoogleOAuthCallback(
  code: string,
  state: string,
): Promise<{ tenantId: string; context: OAuthContext; returnUrl: string }> {
  const { tenantId, context } = verifyOAuthState(state);
  const tokenResponse = await exchangeCodeForToken(code);

  const googleUserId = await resolveGoogleUserId(tokenResponse);
  const accessToken = encryptToken(tokenResponse.access_token);
  const refreshToken = encryptToken(tokenResponse.refresh_token ?? '');
  const tokenExpiresAt = getTokenExpiration(tokenResponse.expires_in);

  if (!tokenExpiresAt) {
    throw new AppError(
      502,
      GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXCHANGE_FAILED,
      'Resposta do Google sem expiração de token válida.'
    );
  }

  const existing = await db.query.googleConnections.findFirst({
    where: eq(googleConnections.tenantId, tenantId),
  });

  if (existing) {
    await db
      .update(googleConnections)
      .set({
        googleUserId,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(googleConnections.id, existing.id));
  } else {
    await db.insert(googleConnections).values({
      tenantId,
      googleUserId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
    });
  }

  return { tenantId, context, returnUrl: RETURN_URLS[context] };
}

/** Retorna a conexão Google atual do tenant (sem tokens), ou null. */
export async function getGoogleConnection(tenantId: string): Promise<GoogleConnectionPublic | null> {
  const connection = await db.query.googleConnections.findFirst({
    where: eq(googleConnections.tenantId, tenantId),
  });

  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    googleUserId: connection.googleUserId,
    accountId: connection.accountId ?? null,
    accountName: connection.accountName ?? null,
    tokenExpiresAt: connection.tokenExpiresAt.toISOString(),
    connected: connection.tokenExpiresAt.getTime() > Date.now(),
  };
}

/** Revoga o token na Google e remove a conexão (perfis espelhados cascateiam). */
export async function disconnectGoogleConnection(
  connectionId: string,
  tenantId: string,
): Promise<{ id: string; disconnected: boolean }> {
  const connection = await db.query.googleConnections.findFirst({
    where: and(eq(googleConnections.id, connectionId), eq(googleConnections.tenantId, tenantId)),
  });

  if (!connection) {
    throw new AppError(404, GOOGLE_ERROR_CODES.NOT_FOUND, 'Conexão não encontrada.');
  }

  const accessToken = decryptToken(connection.accessToken);
  await revokeGoogleToken(accessToken);
  await db.delete(googleConnections).where(eq(googleConnections.id, connectionId));

  return { id: connectionId, disconnected: true };
}

async function getTenantConnection(tenantId: string) {
  const connection = await db.query.googleConnections.findFirst({
    where: eq(googleConnections.tenantId, tenantId),
  });

  if (!connection) {
    throw new AppError(
      404,
      GOOGLE_ERROR_CODES.NOT_FOUND,
      'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
    );
  }
  return connection;
}

function createClientForConnection(connection: {
  id: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}): GoogleApiClient {
  return createGoogleApiClient({
    accessToken: decryptToken(connection.accessToken),
    refreshToken: decryptToken(connection.refreshToken),
    tokenExpiresAt: connection.tokenExpiresAt,
    onTokenRefreshed: async ({ accessToken, refreshToken, tokenExpiresAt }) => {
      await db
        .update(googleConnections)
        .set({
          accessToken: encryptToken(accessToken),
          refreshToken: refreshToken ? encryptToken(refreshToken) : connection.refreshToken,
          tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(googleConnections.id, connection.id));
    },
  });
}

/** Lista as contas de negócio GBP e persiste a conta selecionada na conexão. */
export async function getGoogleAccounts(
  tenantId: string,
): Promise<{ accounts: GoogleAccount[]; selectedAccountId: string | null }> {
  const connection = await getTenantConnection(tenantId);
  const client = createClientForConnection(connection);

  const gbpAccounts = await client.listAccounts();
  const accounts = gbpAccounts.map((account) => ({
    accountId: account.name ?? '',
    accountName: account.accountName ?? '',
  }));

  const selectedAccountId =
    accounts.find((a) => a.accountId === connection.accountId)?.accountId ??
    accounts[0]?.accountId ??
    null;

  if (selectedAccountId) {
    const selected = accounts.find((a) => a.accountId === selectedAccountId);
    await db
      .update(googleConnections)
      .set({
        accountId: selectedAccountId,
        accountName: selected?.accountName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(googleConnections.id, connection.id));
  }

  return { accounts, selectedAccountId };
}

function buildSearchLocation(
  settings: typeof businessProfileSettings.$inferSelect | null,
  tenant: typeof tenants.$inferSelect | null,
): Partial<GbpLocation> {
  const location: Partial<GbpLocation> = {};
  const name = settings?.name || tenant?.name;
  if (name) {
    location.title = name;
  }

  const address = settings?.address as { street?: string; city?: string; state?: string; postalCode?: string; country?: string } | null;
  if (address && (address.street || address.city || address.postalCode)) {
    location.address = {
      addressLines: address.street ? [address.street] : undefined,
      locality: address.city || undefined,
      administrativeArea: address.state || undefined,
      postalCode: address.postalCode || undefined,
      regionCode: address.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  if (settings?.phone) {
    location.phoneNumbers = { primaryPhone: settings.phone };
  }

  return location;
}

function getMatchConfidence(match: GbpLocationMatch, searchTitle: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const location = match.location ?? {};
  const name = location.title ?? match.locationName ?? '';
  if (name && searchTitle && name.toLowerCase().includes(searchTitle.toLowerCase())) {
    return 'HIGH';
  }
  if (match.placeId || location.address) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function mapGbpMatch(match: GbpLocationMatch, searchTitle: string): GoogleLookupMatch {
  const location = match.location ?? {};
  const address = location.address ?? {};
  const gbpLocationId = location.name ?? match.locationName ?? '';

  return {
    gbpLocationId,
    name: location.title ?? match.locationName ?? '',
    address: {
      street: address.addressLines?.join(', ') ?? '',
      city: address.locality ?? '',
      state: address.administrativeArea ?? '',
      postalCode: address.postalCode ?? '',
      country: address.regionCode ?? '',
    },
    phone: location.phoneNumbers?.primaryPhone ?? '',
    verificationState: location.verification?.state ?? 'UNVERIFIED',
    claimed: location.metadata?.canOperateGoogleMyBusiness === true,
    confidence: getMatchConfidence(match, searchTitle),
  };
}

/**
 * Busca na GBP se já existe perfil para o negócio do tenant, usando
 * business_profile_settings (fallback para dados do tenant).
 */
export async function lookupGoogleProfile(tenantId: string): Promise<GoogleLookupResult> {
  const connection = await getTenantConnection(tenantId);
  const settings = (await db.query.businessProfileSettings.findFirst({
    where: eq(businessProfileSettings.tenantId, tenantId),
  })) ?? null;
  const tenant = (await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  })) ?? null;

  const searchLocation = buildSearchLocation(settings, tenant);
  const searchTitle = searchLocation.title ?? '';

  if (!searchTitle) {
    return { found: false, matches: [], duplicateAlert: false };
  }

  const client = createClientForConnection(connection);
  const matches = await client.searchGoogleLocations({
    location: searchLocation,
    languageCode: 'pt-BR',
    pageSize: 5,
  });

  const normalized = matches.map((match) => mapGbpMatch(match, searchTitle));
  const found = normalized.some((match) => match.claimed && match.verificationState === 'VERIFIED');

  return {
    found,
    matches: normalized,
    duplicateAlert: normalized.length > 0 && !found,
  };
}