import {
  db as dbInstance,
  type Database,
} from '../../lib/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { GOOGLE_ERROR_CODES, settingsSchema } from '../../schemas/google.schemas.js';
import { exchangeCodeForToken, getGoogleOAuthConfig, revokeGoogleToken } from '../../lib/google-oauth.js';
import {
  createGoogleApiClient,
  type GbpLocation,
  type GbpLocationMatch,
  type GoogleApiClient,
} from '../../lib/google-api.js';
import { encryptToken, decryptToken } from '../../utils/crypto.js';
import { uploadAsset, deleteAsset } from '../storage/storage.service.js';
import { GoogleRepository } from '../../repository/google.repository.js';

// Módulos de domínio extraídos (refatoração de modularização) — barrels do
// Google Meu Negócio. O service continua sendo o ponto de composição (DI).
import {
  GOOGLE_AUTH_URL,
  GOOGLE_OAUTH_SCOPE,
  RETURN_URLS,
  signOAuthState,
  verifyOAuthState,
  isAllowedFrontendOrigin,
  getTokenExpiration,
  resolveGoogleUserId,
} from './google.oauth.js';
import { assessGoogleProfileQuality } from './google.quality.js';
import {
  EMPTY_ADDRESS,
  VERIFICATION_INSTRUCTIONS,
  POSTAL_VERIFICATION_INSTRUCTIONS,
  mapBusinessHoursToPeriods,
  buildGbpLocationFromSettings,
  mapGbpCategory,
  buildSearchLocation,
  mapGbpMatch,
  settingsAreComplete,
  mapGbpLocationToProfile,
  buildFieldMask,
  buildGbpPatchPayload,
  hasActualChanges,
} from './google.mappers.js';
import type {
  OAuthContext,
  GoogleAccount,
  GoogleCategory,
  GoogleConnectionPublic,
  GoogleLookupResult,
  GoogleSettings,
  GoogleSettingsUpsertResult,
  GoogleProfileCreateResult,
  GoogleVerificationResult,
  GoogleCompleteVerificationResult,
  GoogleProfileResult,
  GoogleSyncLogsResult,
  GooglePhotoUploadResult,
  GoogleServiceDeps,
} from './google.types.js';
import type { GoogleQualityReport } from './google.quality.js';

// ── Barrel público ────────────────────────────────────────────────────────────
// Preserva os imports existentes (controllers, di.ts e testes) que referenciavam
// tipos/funções de google.service.js — continua tudo exportável daqui.
export * from './google.types.js';
export type { GoogleQualityReport, GoogleQualityGrade } from './google.quality.js';
export { getAllowedFrontendOrigins } from './google.oauth.js';
export { assessGoogleProfileQuality } from './google.quality.js';

export type { OAuthContext, GoogleServiceDeps };

const CATEGORIES_CACHE_TTL_MS = 60_000;
const categoriesCache = new Map<string, { expiresAt: number; categories: GoogleCategory[] }>();

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

  /**
   * Avalia completude e recência de um perfil do Google Meu Negócio (função pura).
   * Usada no pré-envio (lookup) e no endpoint de qualidade do perfil.
   */
  assessGoogleProfileQuality(location: GbpLocation, now: Date = new Date()): GoogleQualityReport {
    return assessGoogleProfileQuality(location, now);
  }

  /**
   * Gera a URL de autorização OAuth do Google com o state assinado (10m).
   * `frontendUrl` (origin de onde o usuário iniciou o fluxo) é embutida no state
   * quando está na allowlist configurável (ALLOWED_FRONTEND_ORIGINS), para o
   * callback redirecionar de volta ao ambiente correto (localhost/HMG/prod).
   */
  generateGoogleAuthUrl(tenantId: string, context: OAuthContext = 'settings', frontendUrl?: string): string {
    const { clientId, redirectUri } = this.deps.oauth.getGoogleOAuthConfig();
    const state = signOAuthState({
      tenantId,
      context,
      frontendUrl: frontendUrl && isAllowedFrontendOrigin(frontendUrl) ? frontendUrl : undefined,
    });

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
  ): Promise<{ tenantId: string; context: OAuthContext; returnUrl: string; frontendUrl?: string }> {
    const verified = verifyOAuthState(state);
    const { tenantId, context, frontendUrl } = verified;
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

    return { tenantId, context, returnUrl: RETURN_URLS[context], frontendUrl };
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

    const normalized = matches.map((match) => ({
      ...mapGbpMatch(match, searchTitle),
      quality: match.location ? this.assessGoogleProfileQuality(match.location) : null,
    }));
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
        address: { ...EMPTY_ADDRESS, ...(settings.address as Partial<{ street: string; city: string; state: string; postalCode: string; country: string }> | null) },
        phone: settings.phone,
        email: settings.email ?? '',
        website: settings.website ?? '',
        categoryId: settings.categoryId || null,
        categoryDisplayName: null,
        hours: (settings.hours as GoogleSettings['hours']) ?? null,
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
   * Avalia a qualidade/recência do perfil GBP real do tenant (pré-envio).
   * Busca a location no Google via conexão do perfil e devolve o relatório.
   */
  async assessProfile(profileId: string, tenantId: string): Promise<GoogleQualityReport> {
    const profile = await this.getProfileConnection(profileId, tenantId);

    const connection = await this.repo(tenantId).findGoogleConnectionByRawId(profile.connectionId);
    if (!connection) {
      throw new AppError(
        404,
        GOOGLE_ERROR_CODES.NOT_FOUND,
        'Nenhuma conexão Google encontrada. Conecte sua conta Google para continuar.'
      );
    }

    const client = this.createClientForConnection(connection);
    const gbpLocation = await client.getLocation(profile.gbpLocationId);
    return this.assessGoogleProfileQuality(gbpLocation);
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

export const googleService = new GoogleService();