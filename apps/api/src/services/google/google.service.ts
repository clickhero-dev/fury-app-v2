import jwt from 'jsonwebtoken';
import {
  db as dbInstance,
  googleBusinessProfiles,
  businessProfileSettings,
  tenants,
  type Database,
} from '../../lib/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { GOOGLE_ERROR_CODES, settingsSchema } from '../../schemas/google.schemas.js';
import { exchangeCodeForToken, getGoogleOAuthConfig, revokeGoogleToken } from '../../lib/google-oauth.js';
import {
  createGoogleApiClient,
  type GbpCategory,
  type GbpLocation,
  type GbpLocationMatch,
  type GbpOpenPeriod,
  type GoogleApiClient,
} from '../../lib/google-api.js';
import { encryptToken, decryptToken } from '../../utils/crypto.js';
import { uploadAsset, deleteAsset } from '../storage/storage.service.js';
import { GoogleRepository } from '../../repository/google.repository.js';

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

export interface GoogleAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface GoogleBusinessHours {
  [day: string]: { open: string; close: string }[] | undefined;
}

export interface GoogleSettings {
  name: string;
  address: GoogleAddress;
  phone: string;
  email: string;
  website: string;
  categoryId: string | null;
  categoryDisplayName?: string | null;
  hours: GoogleBusinessHours | null;
  prefilledFrom?: string[];
}

export interface GoogleCategory {
  categoryId: string;
  displayName: string;
  parentId: string | null;
}

export interface GoogleSettingsUpsertResult {
  id: string;
  name: string;
  categoryDisplayName: string | null;
}

const EMPTY_ADDRESS: GoogleAddress = { street: '', city: '', state: '', postalCode: '', country: 'BR' };

export interface GoogleProfileCreateResult {
  id: string;
  gbpLocationId: string;
  name: string;
  syncStatus: 'awaiting_verification';
  verificationState: 'UNVERIFIED';
  created: true;
  verificationInstructions: string;
}

export interface GoogleVerificationOption {
  method: 'POSTAL' | 'PHONE' | 'EMAIL';
  description: string;
}

export interface GoogleVerificationResult {
  verificationState: 'UNVERIFIED' | 'VERIFIED';
  options: GoogleVerificationOption[];
  instructions: string;
}

export type GoogleCompleteVerificationResult =
  | { verificationState: 'UNVERIFIED'; awaitingPin: true }
  | { verificationState: 'VERIFIED'; syncStatus: 'verified' }
  | { verificationState: 'UNVERIFIED'; postalGuidance: true; instructions: string };

const VERIFICATION_INSTRUCTIONS =
  'A Google enviou uma verificação para o seu negócio. Acompanhe o status pelo painel do Google Meu Negócio e conclua os passos solicitados para confirmar que o negócio é seu.';

const POSTAL_VERIFICATION_INSTRUCTIONS =
  'A verificação por cartão postal envia uma carta com um código para o endereço comercial do seu negócio. Quando receber, siga as instruções do cartão e insira o código no Google Meu Negócio.';

const DAY_OF_WEEK_MAP: Record<string, string> = {
  monday: 'MONDAY',
  tuesday: 'TUESDAY',
  wednesday: 'WEDNESDAY',
  thursday: 'THURSDAY',
  friday: 'FRIDAY',
  saturday: 'SATURDAY',
  sunday: 'SUNDAY',
};

function parseGbpTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function mapBusinessHoursToPeriods(hours: GoogleBusinessHours): GbpOpenPeriod[] {
  const periods: GbpOpenPeriod[] = [];
  for (const [day, ranges] of Object.entries(hours)) {
    const openDay = DAY_OF_WEEK_MAP[day.toLowerCase()];
    if (!openDay || !ranges || ranges.length === 0) continue;
    for (const range of ranges) {
      periods.push({
        openDay,
        openTime: parseGbpTime(range.open),
        closeDay: openDay,
        closeTime: parseGbpTime(range.close),
      });
    }
  }
  return periods;
}

function buildGbpLocationFromSettings(
  settings: typeof businessProfileSettings.$inferSelect,
): Partial<GbpLocation> {
  const address = settings.address as Partial<GoogleAddress> | null;
  const location: Partial<GbpLocation> = {
    title: settings.name,
    phoneNumbers: { primaryPhone: settings.phone },
  };

  if (address && (address.street || address.city)) {
    location.address = {
      addressLines: address.street ? [address.street] : undefined,
      locality: address.city || undefined,
      administrativeArea: address.state || undefined,
      postalCode: address.postalCode || undefined,
      regionCode: address.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  if (settings.email) {
    location.emailAddress = settings.email;
  }
  if (settings.website) {
    location.websiteUri = settings.website;
  }
  if (settings.categoryId) {
    location.categories = [{ categoryId: settings.categoryId }];
  }
  const hours = settings.hours as GoogleBusinessHours | null;
  if (hours) {
    const periods = mapBusinessHoursToPeriods(hours);
    if (periods.length > 0) {
      location.openInfo = { periods };
    }
  }

  return location;
}

const CATEGORIES_CACHE_TTL_MS = 60_000;
const categoriesCache = new Map<string, { expiresAt: number; categories: GoogleCategory[] }>();

function mapGbpCategory(category: GbpCategory): GoogleCategory {
  return {
    categoryId: category.categoryId,
    displayName: category.displayName ?? '',
    parentId: category.parentId ?? null,
  };
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

function settingsAreComplete(
  settings: typeof businessProfileSettings.$inferSelect | null,
  tenant: typeof tenants.$inferSelect | null,
): boolean {
  const name = settings?.name ?? tenant?.name ?? '';
  const address = settings?.address as Partial<GoogleAddress> | null;
  const hasAddress = Boolean(address?.street?.trim() || address?.city?.trim());
  const phone = settings?.phone ?? '';
  return Boolean(name.trim()) && hasAddress && Boolean(phone.trim());
}

export interface GoogleProfileResult {
  id: string;
  gbpLocationId: string;
  name: string;
  address: GoogleAddress;
  phone: string;
  email: string;
  website: string;
  categoryId: string | null;
  categoryDisplayName: string | null;
  hours: GoogleBusinessHours | null;
  photos: string[];
  verificationState: 'UNVERIFIED' | 'VERIFIED';
  syncStatus: 'not_connected' | 'connected' | 'no_profile' | 'awaiting_verification' | 'verified' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
}

export interface GoogleSyncLogEntry {
  id: string;
  operation: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface GoogleSyncLogsResult {
  logs: GoogleSyncLogEntry[];
}

function mapGbpLocationToProfile(
  profile: typeof googleBusinessProfiles.$inferSelect,
  gbpLocation: GbpLocation,
  overrideSyncStatus?: GoogleProfileResult['syncStatus'],
): GoogleProfileResult {
  const address = gbpLocation.address ?? {};
  const phoneNumbers = gbpLocation.phoneNumbers ?? {};

  return {
    id: profile.id,
    gbpLocationId: profile.gbpLocationId,
    name: gbpLocation.title ?? profile.name,
    address: {
      street: address.addressLines?.join(', ') ?? '',
      city: address.locality ?? '',
      state: address.administrativeArea ?? '',
      postalCode: address.postalCode ?? '',
      country: address.regionCode ?? 'BR',
    },
    phone: phoneNumbers.primaryPhone ?? profile.phone ?? '',
    email: gbpLocation.emailAddress ?? profile.email ?? '',
    website: gbpLocation.websiteUri ?? profile.website ?? '',
    categoryId: gbpLocation.categories?.[0]?.categoryId ?? profile.categoryId,
    categoryDisplayName: gbpLocation.categories?.[0]?.displayName ?? profile.categoryDisplayName,
    hours: profile.hours as GoogleBusinessHours | null,
    photos: (profile.photos as string[]) ?? [],
    verificationState: (gbpLocation.verification?.state ?? profile.verificationState) as 'UNVERIFIED' | 'VERIFIED',
    syncStatus: overrideSyncStatus ?? (profile.syncStatus as GoogleProfileResult['syncStatus']),
    lastSyncedAt: profile.lastSyncedAt?.toISOString() ?? null,
  };
}

const FIELD_MASK_MAP: Record<string, string> = {
  name: 'title',
  phone: 'phoneNumbers',
  email: 'emailAddress',
  website: 'websiteUri',
  categoryId: 'categories',
  hours: 'openInfo',
  address: 'address',
};

function buildFieldMask(updates: Partial<GbpLocation>): string[] {
  const mask: string[] = [];
  for (const key of Object.keys(updates)) {
    const gbpField = FIELD_MASK_MAP[key];
    if (gbpField) {
      mask.push(gbpField);
    }
  }
  return mask;
}

function buildGbpPatchPayload(data: Record<string, unknown>): Partial<GbpLocation> {
  const payload: Partial<GbpLocation> = {};

  if (data.name !== undefined) {
    payload.title = data.name as string;
  }
  if (data.phone !== undefined) {
    payload.phoneNumbers = { primaryPhone: data.phone as string };
  }
  if (data.email !== undefined) {
    payload.emailAddress = data.email as string;
  }
  if (data.website !== undefined) {
    payload.websiteUri = data.website as string;
  }
  if (data.categoryId !== undefined) {
    payload.categories = data.categoryId ? [{ categoryId: data.categoryId as string }] : undefined;
  }
  if (data.hours !== undefined) {
    const hours = data.hours as GoogleBusinessHours | null;
    if (hours) {
      payload.openInfo = { periods: mapBusinessHoursToPeriods(hours) };
    }
  }
  if (data.address !== undefined) {
    const addr = data.address as Partial<GoogleAddress>;
    payload.address = {
      addressLines: addr.street ? [addr.street] : undefined,
      locality: addr.city || undefined,
      administrativeArea: addr.state || undefined,
      postalCode: addr.postalCode || undefined,
      regionCode: addr.country || 'BR',
      languageCode: 'pt-BR',
    };
  }

  return payload;
}

function hasActualChanges(
  profile: typeof googleBusinessProfiles.$inferSelect,
  data: Record<string, unknown>,
): boolean {
  if (data.name && data.name !== profile.name) return true;
  if (data.phone && data.phone !== profile.phone) return true;
  if (data.email && data.email !== (profile.email ?? '')) return true;
  if (data.website && data.website !== (profile.website ?? '')) return true;
  if (data.categoryId && data.categoryId !== (profile.categoryId ?? '')) return true;
  if (data.hours && JSON.stringify(data.hours) !== JSON.stringify(profile.hours)) return true;
  if (data.address) {
    const currentAddr = profile.address as Partial<GoogleAddress> | null;
    const newAddr = data.address as Partial<GoogleAddress>;
    if (
      newAddr.street !== (currentAddr?.street ?? '') ||
      newAddr.city !== (currentAddr?.city ?? '') ||
      newAddr.state !== (currentAddr?.state ?? '') ||
      newAddr.postalCode !== (currentAddr?.postalCode ?? '') ||
      newAddr.country !== (currentAddr?.country ?? 'BR')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Dependências externas injetadas no GoogleService (OAuth, GBP API e storage).
 * Permite mockar tudo no teste sem tocar em lib/db, HTTP ou R2.
 */
export interface GoogleServiceDeps {
  oauth: {
    exchangeCodeForToken: typeof exchangeCodeForToken;
    getGoogleOAuthConfig: typeof getGoogleOAuthConfig;
    revokeGoogleToken: typeof revokeGoogleToken;
  };
  api: {
    createGoogleApiClient: typeof createGoogleApiClient;
  };
  storage: {
    uploadAsset: typeof uploadAsset;
    deleteAsset: typeof deleteAsset;
  };
}

/**
 * GoogleService — classe pura de domínio com DI no construtor (repoFactory + externos).
 * As funções de módulo viraram métodos usando this.repo(t) / this.deps.*; o singleton
 * (googleService) é consumido pelos controllers via composition root.
 */
export class GoogleService {
  constructor(
    private readonly repoFactory: (tenantId: string) => GoogleRepository = (t) => new GoogleRepository(t),
    private readonly deps: GoogleServiceDeps = {
      oauth: { exchangeCodeForToken, getGoogleOAuthConfig, revokeGoogleToken },
      api: { createGoogleApiClient },
      storage: { uploadAsset, deleteAsset },
    },
  ) {}

  private repo(t: string): GoogleRepository {
    return this.repoFactory(t);
  }

  /** Gera a URL de autorização OAuth do Google com o state assinado (10m). */
  generateGoogleAuthUrl(tenantId: string, context: OAuthContext = 'settings'): string {
    const { clientId, redirectUri } = this.deps.oauth.getGoogleOAuthConfig();
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
  async handleGoogleOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ tenantId: string; context: OAuthContext; returnUrl: string }> {
    const { tenantId, context } = verifyOAuthState(state);
    const tokenResponse = await this.deps.oauth.exchangeCodeForToken(code);

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

    const repo = this.repo(tenantId);
    const existing = await repo.findGoogleConnection();

    if (existing) {
      await repo.patchGoogleConnection(existing.id, {
        googleUserId,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        updatedAt: new Date(),
      });
    } else {
      await repo.createGoogleConnection({
        googleUserId,
        accessToken,
        refreshToken,
        tokenExpiresAt,
      });
    }

    return { tenantId, context, returnUrl: RETURN_URLS[context] };
  }

  /** Retorna a conexão Google atual do tenant (sem tokens), ou null. */
  async getGoogleConnection(tenantId: string): Promise<GoogleConnectionPublic | null> {
    const connection = await this.repo(tenantId).findGoogleConnection();

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
  async disconnectGoogleConnection(
    connectionId: string,
    tenantId: string,
  ): Promise<{ id: string; disconnected: boolean }> {
    const repo = this.repo(tenantId);
    const connection = await repo.findGoogleConnectionById(connectionId);

    if (!connection) {
      throw new AppError(404, GOOGLE_ERROR_CODES.NOT_FOUND, 'Conexão não encontrada.');
    }

    const accessToken = decryptToken(connection.accessToken);
    await this.deps.oauth.revokeGoogleToken(accessToken);
    await repo.deleteGoogleConnection(connectionId);

    return { id: connectionId, disconnected: true };
  }

  private async getTenantConnection(tenantId: string) {
    const connection = await this.repo(tenantId).findGoogleConnection();

    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }
    return connection;
  }

  private createClientForConnection(connection: {
    id: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
  }): GoogleApiClient {
    return this.deps.api.createGoogleApiClient({
      accessToken: decryptToken(connection.accessToken),
      refreshToken: decryptToken(connection.refreshToken),
      tokenExpiresAt: connection.tokenExpiresAt,
      onTokenRefreshed: async ({ accessToken, refreshToken, tokenExpiresAt }) => {
        await this.repo('').patchGoogleConnection(connection.id, {
          accessToken: encryptToken(accessToken),
          refreshToken: refreshToken ? encryptToken(refreshToken) : connection.refreshToken,
          tokenExpiresAt,
          updatedAt: new Date(),
        });
      },
    });
  }

  /** Lista as contas de negócio GBP e persiste a conta selecionada na conexão. */
  async getGoogleAccounts(
    tenantId: string,
  ): Promise<{ accounts: GoogleAccount[]; selectedAccountId: string | null }> {
    const connection = await this.getTenantConnection(tenantId);
    const client = this.createClientForConnection(connection);

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
      await this.repo(tenantId).patchGoogleConnection(connection.id, {
        accountId: selectedAccountId,
        accountName: selected?.accountName ?? null,
        updatedAt: new Date(),
      });
    }

    return { accounts, selectedAccountId };
  }

  /**
   * Busca na GBP se já existe perfil para o negócio do tenant, usando
   * business_profile_settings (fallback para dados do tenant).
   */
  async lookupGoogleProfile(tenantId: string): Promise<GoogleLookupResult> {
    const connection = await this.getTenantConnection(tenantId);
    const repo = this.repo(tenantId);
    const settings = (await repo.findBusinessProfile()) ?? null;
    const tenant = (await repo.findTenant()) ?? null;

    const searchLocation = buildSearchLocation(settings, tenant);
    const searchTitle = searchLocation.title ?? '';

    if (!searchTitle) {
      return { found: false, matches: [], duplicateAlert: false };
    }

    const client = this.createClientForConnection(connection);
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

  /** Constrói o client da API do Google para o tenant (lança NOT_FOUND sem conexão). */
  async getGoogleApiClient(tenantId: string): Promise<GoogleApiClient> {
    const connection = await this.getTenantConnection(tenantId);
    return this.createClientForConnection(connection);
  }

  /** Busca o catálogo de categorias da GBP com cache curto em memória (FR-012). */
  private async getCatalogCategories(
    client: GoogleApiClient,
    tenantId: string,
  ): Promise<GoogleCategory[]> {
    const cacheKey = `catalog:${tenantId}`;
    const cached = categoriesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.categories;
    }
    const gbpCategories = await client.listCategories({ regionCode: 'BR', pageSize: 100 });
    const categories = gbpCategories.map(mapGbpCategory).filter((c) => c.displayName);
    categoriesCache.set(cacheKey, { expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS, categories });
    return categories;
  }

  /** Valida a categoria contra o catálogo oficial e devolve o displayName. */
  private async resolveCategoryDisplayName(
    categoryId: string,
    tenantId: string,
  ): Promise<string | null> {
    const connection = await this.repo(tenantId).findGoogleConnection();

    let client: GoogleApiClient | null = null;
    if (connection) {
      client = this.createClientForConnection(connection);
    } else if (process.env.GOOGLE_API_MOCK === 'true') {
      client = this.deps.api.createGoogleApiClient({ accessToken: 'mock', tokenExpiresAt: null });
    }

    if (!client) {
      return null;
    }

    const categories = await this.getCatalogCategories(client, tenantId);
    const found = categories.find((c) => c.categoryId === categoryId);
    if (!found) {
      throw new AppError(
        422,
        GOOGLE_ERROR_CODES.INVALID_CATEGORY,
        'A categoria selecionada não existe no catálogo do Google.'
      );
    }
    return found.displayName || null;
  }

  /**
   * Retorna business_profile_settings do tenant, pré-preenchido de
   * `tenants.name` + `tenants.businessContext` quando nunca salvo.
   */
  async getGoogleSettings(
    tenantId: string,
    database: Database = dbInstance,
  ): Promise<GoogleSettings> {
    const repo = this.repo(tenantId);
    const [settings, tenant] = await Promise.all([
      repo.findBusinessProfile(),
      repo.findTenant(),
    ]);

    if (settings) {
      const result: GoogleSettings = {
        name: settings.name,
        address: { ...EMPTY_ADDRESS, ...(settings.address as Partial<GoogleAddress> | null) },
        phone: settings.phone,
        email: settings.email ?? '',
        website: settings.website ?? '',
        categoryId: settings.categoryId || null,
        categoryDisplayName: null,
        hours: (settings.hours as GoogleBusinessHours | null) ?? null,
        prefilledFrom: [],
      };
      if (settings.categoryId) {
        try {
          result.categoryDisplayName = await this.resolveCategoryDisplayName(settings.categoryId, tenantId);
        } catch {
          result.categoryDisplayName = null;
        }
      }
      return result;
    }

    return {
      name: tenant?.name ?? '',
      address: EMPTY_ADDRESS,
      phone: '',
      email: '',
      website: '',
      categoryId: null,
      categoryDisplayName: null,
      hours: null,
      prefilledFrom: ['tenant.name', 'tenant.businessContext'],
    };
  }

  /** Valida e faz upsert (1/tenant) dos dados do negócio em business_profile_settings. */
  async updateGoogleSettings(
    tenantId: string,
    data: unknown,
    database: Database = dbInstance,
  ): Promise<GoogleSettingsUpsertResult> {
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.'));
      throw new AppError(400, GOOGLE_ERROR_CODES.VALIDATION_ERROR, 'Dados do negócio inválidos.', { fields });
    }
    const values = parsed.data;

    const fields: string[] = [];
    if (!values.name?.trim()) fields.push('name');
    const address = values.address ?? {};
    if (!address.street?.trim() && !address.city?.trim()) fields.push('address');
    if (!values.phone?.trim()) fields.push('phone');
    if (fields.length > 0) {
      throw new AppError(
        400,
        GOOGLE_ERROR_CODES.VALIDATION_ERROR,
        'Preencha os campos obrigatórios do negócio.',
        { fields }
      );
    }

    let categoryDisplayName: string | null = null;
    if (values.categoryId) {
      categoryDisplayName = await this.resolveCategoryDisplayName(values.categoryId, tenantId);
    }

    const payload = {
      name: values.name,
      address: values.address,
      phone: values.phone,
      email: values.email ?? '',
      website: values.website ?? '',
      categoryId: values.categoryId || '',
      hours: values.hours ?? null,
      updatedAt: new Date(),
    };

    const repo = this.repo(tenantId);
    const id = await repo.upsertBusinessProfile(payload);
    return { id, name: payload.name, categoryDisplayName };
  }

  /** Autocomplete de categorias do catálogo oficial da GBP (FR-012) com cache em memória. */
  async getGoogleCategories(
    query: string,
    googleApi: GoogleApiClient,
    tenantId: string,
  ): Promise<{ categories: GoogleCategory[] }> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return { categories: [] };
    }

    const cacheKey = `${tenantId}:${normalizedQuery}`;
    const cached = categoriesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { categories: cached.categories };
    }

    const gbpCategories = await googleApi.listCategories({
      query,
      regionCode: 'BR',
      pageSize: 20,
    });

    const categories = gbpCategories.map(mapGbpCategory).filter((c) => c.displayName);
    categoriesCache.set(cacheKey, { expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS, categories });
    return { categories };
  }

  /**
   * Cria um novo perfil na GBP com os dados de business_profile_settings (US2).
   * Valida dados completos, bloqueia duplicado com confiança alta (FR-011),
   * cria a location no Google e persiste o espelho + log de sincronização.
   */
  async createProfile(
    tenantId: string,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleProfileCreateResult> {
    const connection = await this.getTenantConnection(tenantId);
    const repo = this.repo(tenantId);
    const settings = (await repo.findBusinessProfile()) ?? null;
    const tenant = (await repo.findTenant()) ?? null;

    if (!settings || !settingsAreComplete(settings, tenant)) {
      throw new AppError(
        400,
        GOOGLE_ERROR_CODES.BUSINESS_SETTINGS_INCOMPLETE,
        'Preencha os dados do negócio antes de criar o perfil.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);

    const searchLocation = buildSearchLocation(settings, tenant);
    const searchTitle = searchLocation.title ?? '';
    let matches: GbpLocationMatch[] = [];
    if (searchTitle) {
      matches = await client.searchGoogleLocations({
        location: searchLocation,
        languageCode: 'pt-BR',
        pageSize: 5,
      });
    }

    const highConfidence = matches
      .map((match) => mapGbpMatch(match, searchTitle))
      .filter((match) => match.confidence === 'HIGH');

    if (highConfidence.length > 0) {
      throw new AppError(
        409,
        GOOGLE_ERROR_CODES.DUPLICATE_LOCATION,
        'Já existe um perfil para este endereço no Google. Deseja reivindicá-lo?',
        {
          matches: highConfidence.map((match) => ({
            gbpLocationId: match.gbpLocationId,
            confidence: match.confidence,
          })),
        }
      );
    }

    const accountName = connection.accountId;
    if (!accountName) {
      throw new AppError(
        422,
        GOOGLE_ERROR_CODES.GBP_CREATION_NOT_SUPPORTED,
        'O Google não permite criar o perfil automaticamente. Vamos orientar a criação manual.',
        { reason: 'Nenhuma conta de negócio foi selecionada.' }
      );
    }

    let createdLocation: GbpLocation;
    try {
      createdLocation = await client.createLocation(accountName, buildGbpLocationFromSettings(settings));
    } catch (error) {
      if (
        (error as AppError)?.code === GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXPIRED &&
        (error as AppError)?.statusCode === 401
      ) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : 'Erro desconhecido da API do Google.';
      throw new AppError(
        422,
        GOOGLE_ERROR_CODES.GBP_CREATION_NOT_SUPPORTED,
        'O Google não permite criar o perfil automaticamente. Vamos orientar a criação manual.',
        { reason }
      );
    }

    const gbpLocationId = createdLocation.name ?? '';

    const inserted = await repo.createBusinessProfile({
      connectionId: connection.id,
      gbpLocationId,
      name: settings.name,
      address: settings.address,
      phone: settings.phone,
      email: settings.email ?? '',
      website: settings.website ?? '',
      categoryId: settings.categoryId || null,
      categoryDisplayName: null,
      hours: settings.hours ?? null,
      verificationState: 'UNVERIFIED',
      syncStatus: 'awaiting_verification',
    });

    await repo.createSyncLog({
      connectionId: connection.id,
      profileId: inserted.id,
      operation: 'create',
      status: 'success',
      message: 'Perfil criado. Aguardando verificação.',
      details: { gbpLocationId },
    });

    return {
      id: inserted.id,
      gbpLocationId,
      name: inserted.name ?? settings.name,
      syncStatus: 'awaiting_verification',
      verificationState: 'UNVERIFIED',
      created: true,
      verificationInstructions: VERIFICATION_INSTRUCTIONS,
    };
  }

  private async getProfileConnection(profileId: string, tenantId: string) {
    const profile = await this.repo(tenantId).getBusinessProfile(profileId);
    if (!profile) {
      throw new AppError(404, GOOGLE_ERROR_CODES.NOT_FOUND, 'Perfil não encontrado.');
    }
    return profile;
  }

  /**
   * Retorna o status de verificação do perfil e os métodos elegíveis (US2).
   */
  async getVerification(
    profileId: string,
    tenantId: string,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleVerificationResult> {
    const repo = this.repo(tenantId);
    const profile = await repo.getBusinessProfile(profileId);
    if (!profile) {
      throw new AppError(404, GOOGLE_ERROR_CODES.NOT_FOUND, 'Perfil não encontrado.');
    }

    if (profile.verificationState === 'VERIFIED') {
      return {
        verificationState: 'VERIFIED',
        options: [],
        instructions: VERIFICATION_INSTRUCTIONS,
      };
    }

    const connection = await repo.findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);
    const options = await client.fetchVerificationOptions(profile.gbpLocationId);

    return {
      verificationState: 'UNVERIFIED',
      options: options
        .filter(
          (option) =>
            option.verificationMethod === 'POSTAL' ||
            option.verificationMethod === 'PHONE' ||
            option.verificationMethod === 'EMAIL'
        )
        .map((option) => ({
          method: option.verificationMethod as 'POSTAL' | 'PHONE' | 'EMAIL',
          description: option.announcement ?? '',
        })),
      instructions: VERIFICATION_INSTRUCTIONS,
    };
  }

  /**
   * Conclui a verificação do perfil: envia PIN via verifyLocation para
   * PHONE/EMAIL, ou orienta o cartão postal quando o método é POSTAL (US2).
   */
  async completeVerification(
    profileId: string,
    tenantId: string,
    method: string,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleCompleteVerificationResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    if (method === 'POSTAL') {
      return {
        verificationState: 'UNVERIFIED',
        postalGuidance: true,
        instructions: POSTAL_VERIFICATION_INSTRUCTIONS,
      };
    }

    const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);
    await client.verifyLocation(profile.gbpLocationId, method);
    const gbpLocation = await client.getLocation(profile.gbpLocationId);

    if (gbpLocation.verification?.state === 'VERIFIED') {
      await this.repo(tenantId).patchBusinessProfile(profile.id, {
        verificationState: 'VERIFIED',
        syncStatus: 'verified',
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      });
      await this.repo(tenantId).createSyncLog({
        connectionId: connection.id,
        profileId: profile.id,
        operation: 'verify',
        status: 'success',
        message: 'Perfil verificado pelo Google.',
      });

      return { verificationState: 'VERIFIED', syncStatus: 'verified' };
    }

    return { verificationState: 'UNVERIFIED', awaitingPin: true };
  }

  /**
   * Retorna o perfil espelhado com dados frescos do GBP (US3).
   */
  async getProfile(
    profileId: string,
    tenantId: string,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleProfileResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);
    const gbpLocation = await client.getLocation(profile.gbpLocationId);

    await this.repo(tenantId).patchBusinessProfile(profile.id, {
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    });

    return mapGbpLocationToProfile(profile, gbpLocation);
  }

  /**
   * Atualiza campos do perfil no GBP com field mask e retorna com syncStatus syncing (US3).
   */
  async updateProfile(
    profileId: string,
    tenantId: string,
    data: Record<string, unknown>,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleProfileResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    if (!hasActualChanges(profile, data)) {
      const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
      if (!connection) {
        throw new AppError(
          404,
          GOOGLE_ERROR_CODES.NOT_FOUND,
          'Nenhuma conexão Google encontrada.'
        );
      }
      const client = googleApi ?? this.createClientForConnection(connection);
      const gbpLocation = await client.getLocation(profile.gbpLocationId);
      return mapGbpLocationToProfile(profile, gbpLocation, 'synced');
    }

    const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);
    const patchPayload = buildGbpPatchPayload(data);
    const fieldMask = buildFieldMask(patchPayload);

    try {
      const updatedLocation = await client.patchLocation(profile.gbpLocationId, patchPayload, fieldMask);

      await this.repo(tenantId).patchBusinessProfile(profile.id, {
        syncStatus: 'synced' as any,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      });
      await this.repo(tenantId).createSyncLog({
        connectionId: connection.id,
        profileId: profile.id,
        operation: 'update',
        status: 'success',
        message: 'Perfil atualizado com sucesso.',
        details: { fieldMask },
      });

      return mapGbpLocationToProfile(profile, updatedLocation, 'synced');
    } catch (error) {
      await this.repo(tenantId).patchBusinessProfile(profile.id, {
        syncStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Erro desconhecido',
        updatedAt: new Date(),
      });

      const reason = error instanceof Error ? error.message : 'Erro desconhecido da API do Google.';
      throw new AppError(
        409,
        GOOGLE_ERROR_CODES.GBP_UPDATE_REJECTED,
        'O Google rejeitou a atualização do perfil.',
        { reason }
      );
    }
  }

  /**
   * Dispara sync imediato do perfil com o GBP (US3).
   */
  async syncProfile(
    profileId: string,
    tenantId: string,
    database: Database = dbInstance,
    googleApi?: GoogleApiClient,
  ): Promise<GoogleProfileResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = googleApi ?? this.createClientForConnection(connection);
    const gbpLocation = await client.getLocation(profile.gbpLocationId);

    const repo = this.repo(tenantId);
    await repo.patchBusinessProfile(profile.id, {
      syncStatus: 'synced' as any,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSyncLog({
      connectionId: connection.id,
      profileId: profile.id,
      operation: 'sync',
      status: 'success',
      message: 'Sincronizado com sucesso.',
    });

    return mapGbpLocationToProfile(profile, gbpLocation);
  }

  /**
   * Retorna histórico de operações de sincronização do perfil (US3).
   */
  async getSyncLogs(
    profileId: string,
    tenantId: string,
    limit = 20,
    database: Database = dbInstance,
  ): Promise<GoogleSyncLogsResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const logs = await this.repo(tenantId).listSyncLogs(profile.id, limit);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        operation: log.operation,
        status: log.status,
        message: log.message ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Adiciona foto ao perfil (upload para R2, associação manual — FR-006).
   */
  async addPhoto(
    profileId: string,
    tenantId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    database: Database = dbInstance,
  ): Promise<GooglePhotoUploadResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const photoUrl = await this.deps.storage.uploadAsset(buffer, fileName, mimeType);

    const currentPhotos = (profile.photos as string[]) ?? [];
    const updatedPhotos = [...currentPhotos, photoUrl];

    const repo = this.repo(tenantId);
    await repo.patchBusinessProfile(profile.id, { photos: updatedPhotos, updatedAt: new Date() });
    await repo.createSyncLog({
      connectionId: profile.connectionId,
      profileId: profile.id,
      operation: 'update',
      status: 'success',
      message: 'Foto associada manualmente ao perfil.',
    });

    return { photos: updatedPhotos, associatedManually: true };
  }

  /**
   * Remove foto do perfil (apenas local — NÃO remove do GBP).
   */
  async removePhoto(
    profileId: string,
    tenantId: string,
    photoUrl: string,
    database: Database = dbInstance,
  ): Promise<GooglePhotoUploadResult> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const currentPhotos = (profile.photos as string[]) ?? [];
    const updatedPhotos = currentPhotos.filter((p) => p !== photoUrl);

    await this.deps.storage.deleteAsset(photoUrl);

    await this.repo(tenantId).patchBusinessProfile(profile.id, { photos: updatedPhotos, updatedAt: new Date() });

    return { photos: updatedPhotos, associatedManually: true };
  }
}

export interface GooglePhotoUploadResult {
  photos: string[];
  associatedManually: true;
}

export const googleService = new GoogleService();