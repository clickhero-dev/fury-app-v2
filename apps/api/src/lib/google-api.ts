import { AppError } from '../middleware/errorHandler.js';
import { refreshAccessToken } from './google-oauth.js';
import { GOOGLE_ERROR_CODES } from '../schemas/google.schemas.js';

/**
 * Cliente REST do Google Business Profile — stack v1 (2026).
 *
 * A API v4 (mybusiness.googleapis.com) foi deprecada pelo Google. A v1
 * divide-se em TRÊS hosts:
 *  - Account Management:  mybusinessaccountmanagement.googleapis.com/v1
 *  - Business Information: mybusinessbusinessinformation.googleapis.com/v1
 *  - Verifications:        mybusinessverifications.googleapis.com/v1
 *
 * Diferenças críticas vs v4:
 *  - `readMask` OBRIGATÓRIO em accounts.locations.list e locations.get
 *  - `updateMask` obrigatório em locations.patch
 *  - googleLocations:search → POST {host v1}/googleLocations:search
 *    (resposta `googleLocations[]`, não `matchingLocations`)
 *  - fetchVerificationOptions → POST (v4 era GET)
 *  - locations.getVoiceOfMerchantState → GET {name}/VoiceOfMerchantState
 *    (resposta { hasVoiceOfMerchant, hasBusinessAuthority })
 *  - categories.list → regionCode + languageCode + view OBRIGATÓRIOS;
 *    busca por prefixo via `filter=displayName=...`
 *  - Location `name` no formato `locations/{id}` (v4 usava
 *    `accounts/{a}/locations/{l}`); normalizamos entradas legadas.
 */
const ACCOUNT_MGMT_BASE_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BIZ_INFO_BASE_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const VERIFICATIONS_BASE_URL = 'https://mybusinessverifications.googleapis.com/v1';

const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LANGUAGE = 'pt-BR';
// Teto de páginas (100 locais cada) para não esgotar a quota
const MAX_LOCATION_PAGES = 20;

export class GoogleApiError extends AppError {
  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(statusCode, code, message, details);
  }
}

export interface GbpAddress {
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  regionCode?: string;
  languageCode?: string;
}

export interface GbpCategory {
  categoryId: string;
  displayName?: string;
  parentId?: string;
}

export interface GbpOpenPeriod {
  openDay?: string;
  openTime?: { hours?: number; minutes?: number };
  closeDay?: string;
  closeTime?: { hours?: number; minutes?: number };
}

export interface GbpDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface GbpSpecialHourPeriod {
  startDate?: GbpDate;
  endDate?: GbpDate;
  openTime?: { hours?: number; minutes?: number };
  closeTime?: { hours?: number; minutes?: number };
  closed?: boolean;
}

export interface GbpMoreHours {
  hoursTypeId?: string;
  periods?: GbpOpenPeriod[];
}

export interface GbpLocationMetadata {
  placeId?: string;
  mapsUri?: string;
  newReviewUri?: string;
  canHaveFoodMenus?: boolean;
  canOperateLodgingData?: boolean;
  canOperateLocalPost?: boolean;
  hasVoiceOfMerchant?: boolean;
  hasPendingEdits?: boolean;
  // Ausentes na v1 (sempre undefined); mantidos por compatibilidade
  canOperateGoogleMyBusiness?: boolean;
  updateTime?: string;
}

// Forma interna; o client converte de/para a v1 (fromV1Location/toV1Location)
export interface GbpLocation {
  name?: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  websiteUri?: string;
  emailAddress?: string;
  categories?: GbpCategory[];
  address?: GbpAddress;
  openInfo?: { periods?: GbpOpenPeriod[] };
  specialHours?: { specialHourPeriods?: GbpSpecialHourPeriod[] };
  moreHours?: GbpMoreHours[];
  description?: string;
  openingStatus?: string;
  latlng?: { latitude?: number; longitude?: number };
  labels?: string[];
  metadata?: GbpLocationMetadata;
  verification?: { state?: string };
}

// Formato real da Business Information v1
interface V1Category {
  name?: string;
  displayName?: string;
}

interface V1Location {
  name?: string;
  title?: string;
  phoneNumbers?: GbpLocation['phoneNumbers'];
  websiteUri?: string;
  categories?: { primaryCategory?: V1Category; additionalCategories?: V1Category[] };
  storefrontAddress?: GbpAddress;
  regularHours?: { periods?: GbpOpenPeriod[] };
  specialHours?: GbpLocation['specialHours'];
  moreHours?: GbpMoreHours[];
  profile?: { description?: string };
  openInfo?: { status?: string; canReopen?: boolean; openingDate?: GbpDate };
  latlng?: GbpLocation['latlng'];
  labels?: string[];
  metadata?: GbpLocationMetadata;
}

interface V1GoogleLocation {
  name?: string;
  location?: V1Location;
  requestAdminRightsUri?: string;
}

export interface GbpAccount {
  name?: string;
  accountName?: string;
  type?: string;
  role?: string;
}

export type GbpVerificationMethod = 'POSTAL' | 'PHONE' | 'EMAIL' | string;

export interface GbpVerificationOption {
  verificationMethod: GbpVerificationMethod;
  announcement?: string;
}

export interface GbpVerification {
  name?: string;
  verificationMethod?: string;
  state?: string;
  createTime?: string;
}

export interface GbpLocationMatch {
  locationName?: string;
  placeId?: string;
  location?: GbpLocation;
  /** v1: presente quando o perfil já é de outro dono — redireciona para reivindicação. */
  requestAdminRightsUrl?: string;
}

export interface GbpVoiceOfMerchantState {
  hasVoiceOfMerchant: boolean;
  hasBusinessAuthority: boolean;
}

export interface GbpSearchGoogleLocationsParams {
  location?: Partial<GbpLocation>;
  languageCode?: string;
  pageSize?: number;
}

export interface GbpListCategoriesParams {
  accountName?: string;
  query?: string;
  regionCode?: string;
  pageSize?: number;
}

interface GbpAccountsResponse {
  accounts?: GbpAccount[];
}

interface GbpLocationsResponse {
  locations?: V1Location[];
  nextPageToken?: string;
}

interface GbpSearchLocationsResponse {
  googleLocations?: V1GoogleLocation[];
}

interface GbpVerificationOptionsResponse {
  options?: GbpVerificationOption[];
}

interface GbpVerificationsResponse {
  verifications?: GbpVerification[];
}

interface GbpCategoriesResponse {
  categories?: V1Category[];
  nextPageToken?: string;
}

interface GbpVerifyLocationResponse {
  verification?: GbpVerification;
}

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

const MOCK_ACCOUNT_NAME = 'accounts/123456';
const MOCK_LOCATION_NAME = 'locations/789';

const MOCK_WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const mockLocation: V1Location = {
  name: MOCK_LOCATION_NAME,
  title: 'Minha Empresa Ltda',
  phoneNumbers: { primaryPhone: '+551****9999' },
  websiteUri: 'https://empresa.com.br',
  categories: { primaryCategory: { name: 'gcid:bakery', displayName: 'Padaria' } },
  storefrontAddress: {
    addressLines: ['Av. Paulista, 1000'],
    locality: 'São Paulo',
    administrativeArea: 'SP',
    postalCode: '01310-100',
    regionCode: 'BR',
    languageCode: 'pt-BR',
  },
  regularHours: {
    periods: MOCK_WEEKDAYS.map((day) => ({
      openDay: day,
      openTime: { hours: 8, minutes: 0 },
      closeDay: day,
      closeTime: { hours: 18, minutes: 0 },
    })),
  },
  profile: { description: 'Padaria artesanal com pães de fermentação natural, doces e café.' },
  openInfo: { status: 'OPEN' },
  metadata: {
    placeId: 'ChIJmockplaceid',
    mapsUri: 'https://maps.google.com/?cid=123456789',
    newReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJmockplaceid',
    canHaveFoodMenus: true,
  },
};

const mockGoogleLocation: V1GoogleLocation = {
  name: 'googleLocations/mock-1',
  location: mockLocation,
};

const mockCategories: V1Category[] = [
  { name: 'gcid:bakery', displayName: 'Padaria' },
  { name: 'gcid:bakery_patisserie', displayName: 'Padaria e Confeitaria' },
  { name: 'gcid:coffee_shop', displayName: 'Cafeteria' },
  { name: 'gcid:restaurant', displayName: 'Restaurante' },
];

// v1 → interno: storefrontAddress/regularHours/profile/categories{primary,additional}
function fromV1Category(category: V1Category): GbpCategory {
  return {
    categoryId: (category.name ?? '').replace(/^categories\//, ''),
    displayName: category.displayName,
  };
}

export function fromV1Location(raw: V1Location): GbpLocation {
  const { storefrontAddress, regularHours, categories, profile, openInfo, ...rest } = raw;
  const location: GbpLocation = { ...rest };
  const allCategories = [categories?.primaryCategory, ...(categories?.additionalCategories ?? [])]
    .filter((c): c is V1Category => Boolean(c?.name));

  if (storefrontAddress) location.address = storefrontAddress;
  if (regularHours?.periods) location.openInfo = { periods: regularHours.periods };
  if (allCategories.length) location.categories = allCategories.map(fromV1Category);
  if (profile?.description !== undefined) location.description = profile.description;
  if (openInfo?.status) location.openingStatus = openInfo.status;
  return location;
}

// interno → v1; e-mail não existe na v1 e é descartado
export function toV1Location(location: Partial<GbpLocation>): V1Location {
  const {
    address,
    openInfo,
    categories,
    description,
    emailAddress: _email,
    openingStatus: _status,
    verification: _verification,
    ...rest
  } = location;
  const body: V1Location = { ...rest };

  if (address) body.storefrontAddress = address;
  if (openInfo?.periods) body.regularHours = { periods: openInfo.periods };
  if (categories?.length) {
    const [primary, ...additional] = categories;
    body.categories = {
      primaryCategory: { name: primary.categoryId },
      additionalCategories: additional.map((c) => ({ name: c.categoryId })),
    };
  }
  if (description !== undefined) body.profile = { description };
  return body;
}

const V1_MASK_FIELDS: Record<string, string | null> = {
  address: 'storefrontAddress',
  openInfo: 'regularHours',
  description: 'profile.description',
  emailAddress: null,
};

export function toV1UpdateMask(fieldMask: string[]): string[] {
  const mapped = fieldMask.map((field) => (field in V1_MASK_FIELDS ? V1_MASK_FIELDS[field] : field));
  return [...new Set(mapped.filter((field): field is string => Boolean(field)))];
}

function fromV1GoogleLocation(match: V1GoogleLocation): GbpLocationMatch {
  const location = match.location ? fromV1Location(match.location) : undefined;
  return {
    locationName: location?.name ?? match.name,
    placeId: location?.metadata?.placeId,
    location,
    requestAdminRightsUrl: match.requestAdminRightsUri,
  };
}

const mockVerificationOptions: GbpVerificationOption[] = [
  { verificationMethod: 'POSTAL', announcement: 'Enviar cartão postal para o endereço comercial' },
  { verificationMethod: 'PHONE', announcement: 'Verificar por telefone' },
  { verificationMethod: 'EMAIL', announcement: 'Verificar por email' },
];

const mockVerifications: GbpVerification[] = [
  {
    name: `${MOCK_LOCATION_NAME}/verifications/1`,
    verificationMethod: 'EMAIL',
    state: 'PENDING',
    createTime: '2026-08-17T10:00:00.000Z',
  },
];

/**
 * Normaliza um resource name de Location para o formato v1 `locations/{id}`.
 * Aceita entradas legadas v4 (`accounts/{a}/locations/{l}`) e já-normalizadas.
 */
export function normalizeLocationName(name: string): string {
  if (!name) return name;
  const legacyMatch = name.match(/^accounts\/[^/]+\/locations\/(.+)$/);
  if (legacyMatch) return `locations/${legacyMatch[1]}`;
  if (name.startsWith('locations/')) return name;
  return `locations/${name.replace(/^\/+/, '')}`;
}

function mockGbpRequest<T>(base: string, path: string, options: RequestOptions): T {
  const method = options.method ?? 'GET';

  if (method === 'POST' && path === '/googleLocations:search') {
    return { googleLocations: [mockGoogleLocation] } as T;
  }

  if (method === 'GET' && base === ACCOUNT_MGMT_BASE_URL && path === '/accounts') {
    return { accounts: [{ name: MOCK_ACCOUNT_NAME, accountName: 'Minha Empresa Ltda', type: 'PERSONAL' }] } as T;
  }

  if (method === 'GET' && path === '/categories') {
    return { categories: mockCategories } as T;
  }

  if (method === 'GET' && path.endsWith('/locations')) {
    return { locations: [mockLocation] } as T;
  }

  if (method === 'POST' && path.endsWith('/locations')) {
    return mockLocation as T;
  }

  if (method === 'POST' && path.endsWith(':fetchVerificationOptions')) {
    return { options: mockVerificationOptions } as T;
  }

  if (method === 'POST' && path.endsWith(':verify')) {
    return { verification: { state: 'PENDING' } } as T;
  }

  if (method === 'GET' && path.endsWith('/verifications')) {
    return { verifications: mockVerifications } as T;
  }

  if (method === 'GET' && path.endsWith('/VoiceOfMerchantState')) {
    return { hasVoiceOfMerchant: true, hasBusinessAuthority: true } as T;
  }

  return mockLocation as T;
}

export interface GoogleApiClientDeps {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date | null;
  onTokenRefreshed?: (tokens: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: Date;
  }) => Promise<void> | void;
}

export interface GoogleApiClient {
  listAccounts(): Promise<GbpAccount[]>;
  listLocations(accountName: string): Promise<GbpLocation[]>;
  createLocation(accountName: string, location: Partial<GbpLocation>): Promise<GbpLocation>;
  searchGoogleLocations(params: GbpSearchGoogleLocationsParams): Promise<GbpLocationMatch[]>;
  getLocation(locationName: string): Promise<GbpLocation>;
  patchLocation(
    locationName: string,
    updates: Partial<GbpLocation>,
    fieldMask: string[]
  ): Promise<GbpLocation>;
  fetchVerificationOptions(locationName: string): Promise<GbpVerificationOption[]>;
  verifyLocation(locationName: string, method: string): Promise<GbpVerifyLocationResponse>;
  listVerifications(locationName: string): Promise<GbpVerification[]>;
  listCategories(params: GbpListCategoriesParams): Promise<GbpCategory[]>;
  getVoiceOfMerchantState(locationName: string): Promise<GbpVoiceOfMerchantState>;
}

const LOCATION_READ_MASK = [
  'name',
  'title',
  'storefrontAddress',
  'phoneNumbers',
  'categories',
  'regularHours',
  'specialHours',
  'moreHours',
  'openInfo',
  'latlng',
  'websiteUri',
  'metadata',
  'profile',
  'labels',
].join(',');

export function createGoogleApiClient(deps: GoogleApiClientDeps): GoogleApiClient {
  let accessToken = deps.accessToken;
  let refreshToken = deps.refreshToken;
  let tokenExpiresAt = deps.tokenExpiresAt ?? null;

  const isMock = process.env.GOOGLE_API_MOCK === 'true';

  async function persistRefreshedTokens(tokens: { accessToken: string; refreshToken?: string; tokenExpiresAt: Date }): Promise<void> {
    accessToken = tokens.accessToken;
    if (tokens.refreshToken) refreshToken = tokens.refreshToken;
    tokenExpiresAt = tokens.tokenExpiresAt;
    if (deps.onTokenRefreshed) {
      await deps.onTokenRefreshed(tokens);
    }
  }

  async function doRefresh(): Promise<void> {
    if (!refreshToken) {
      throw new GoogleApiError(
        401,
        GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXPIRED,
        'Sua conexão com o Google expirou. Reconecte para continuar.'
      );
    }
    try {
      const tokens = await refreshAccessToken(refreshToken);
      await persistRefreshedTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new GoogleApiError(
        401,
        GOOGLE_ERROR_CODES.GOOGLE_TOKEN_EXPIRED,
        'Sua conexão com o Google expirou. Reconecte para continuar.'
      );
    }
  }

  async function ensureFreshToken(): Promise<string> {
    const withinWindow =
      tokenExpiresAt !== null && tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_WINDOW_MS;
    if (withinWindow) {
      await doRefresh();
    }
    return accessToken;
  }

  async function rawRequest<T>(base: string, path: string, options: RequestOptions, token: string): Promise<T> {
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const fetchOptions: RequestInit = {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
      throw new GoogleApiError(
        502,
        'GOOGLE_API_ERROR',
        `Falha de rede ao chamar a API do Google (${path}).`
      );
    }

    if (!response.ok) {
      const errorPayload = payload as GoogleApiErrorPayload;
      const message =
        errorPayload?.error?.message || `Erro da API do Google (${response.status}) ao chamar ${path}.`;
      throw new GoogleApiError(response.status, 'GOOGLE_API_ERROR', message, {
        googleError: errorPayload?.error ?? null,
        path,
      });
    }

    return payload as T;
  }

  function isUnauthorizedError(err: unknown): boolean {
    const googleError = (err as GoogleApiError)?.details?.googleError as
      | GoogleApiErrorPayload['error']
      | undefined;
    return (
      err instanceof GoogleApiError &&
      (err.statusCode === 401 || googleError?.status === 'UNAUTHENTICATED')
    );
  }

  async function request<T>(base: string, path: string, options: RequestOptions = {}): Promise<T> {
    if (isMock) {
      return mockGbpRequest<T>(base, path, options);
    }

    const token = await ensureFreshToken();

    try {
      return await rawRequest<T>(base, path, options, token);
    } catch (err) {
      if (isUnauthorizedError(err) && refreshToken) {
        await doRefresh();
        return rawRequest<T>(base, path, options, accessToken);
      }
      throw err;
    }
  }

  const api: GoogleApiClient = {
    async listAccounts(): Promise<GbpAccount[]> {
      const response = await request<GbpAccountsResponse>(ACCOUNT_MGMT_BASE_URL, '/accounts');
      return response.accounts ?? [];
    },

    async listLocations(accountName: string): Promise<GbpLocation[]> {
      const locations: GbpLocation[] = [];
      let pageToken: string | undefined;
      let pages = 0;

      do {
        const query: Record<string, string> = {
          readMask: LOCATION_READ_MASK,
          pageSize: '100',
        };
        if (pageToken) query.pageToken = pageToken;

        const response = await request<GbpLocationsResponse>(
          BIZ_INFO_BASE_URL,
          `/${accountName}/locations`,
          { query }
        );
        locations.push(...(response.locations ?? []).map(fromV1Location));
        pageToken = response.nextPageToken;
        pages += 1;
      } while (pageToken && pages < MAX_LOCATION_PAGES);

      return locations;
    },

    async createLocation(accountName: string, location: Partial<GbpLocation>): Promise<GbpLocation> {
      const created = await request<V1Location>(BIZ_INFO_BASE_URL, `/${accountName}/locations`, {
        method: 'POST',
        body: toV1Location(location),
      });
      return fromV1Location(created);
    },

    async searchGoogleLocations(params: GbpSearchGoogleLocationsParams): Promise<GbpLocationMatch[]> {
      const location = params.location ?? {};
      const response = await request<GbpSearchLocationsResponse>(
        BIZ_INFO_BASE_URL,
        '/googleLocations:search',
        {
          method: 'POST',
          body: {
            pageSize: params.pageSize ?? 3,
            location: {
              ...toV1Location(location),
              languageCode: params.languageCode ?? DEFAULT_LANGUAGE,
            },
          },
        }
      );
      return (response.googleLocations ?? []).map(fromV1GoogleLocation);
    },

    async getLocation(locationName: string): Promise<GbpLocation> {
      const location = await request<V1Location>(
        BIZ_INFO_BASE_URL,
        `/${normalizeLocationName(locationName)}`,
        { query: { readMask: LOCATION_READ_MASK } }
      );
      return fromV1Location(location);
    },

    async patchLocation(
      locationName: string,
      updates: Partial<GbpLocation>,
      fieldMask: string[]
    ): Promise<GbpLocation> {
      const updateMask = toV1UpdateMask(fieldMask);
      // Nada a enviar (ex.: só e-mail): devolve o estado atual sem PATCH
      if (updateMask.length === 0) {
        return api.getLocation(locationName);
      }
      const updated = await request<V1Location>(
        BIZ_INFO_BASE_URL,
        `/${normalizeLocationName(locationName)}`,
        {
          method: 'PATCH',
          body: toV1Location(updates),
          query: { updateMask: updateMask.join(',') },
        }
      );
      return fromV1Location(updated);
    },

    async fetchVerificationOptions(locationName: string): Promise<GbpVerificationOption[]> {
      const response = await request<GbpVerificationOptionsResponse>(
        VERIFICATIONS_BASE_URL,
        `/${normalizeLocationName(locationName)}:fetchVerificationOptions`,
        { method: 'POST', body: { languageCode: DEFAULT_LANGUAGE } }
      );
      return response.options ?? [];
    },

    async verifyLocation(locationName: string, method: string): Promise<GbpVerifyLocationResponse> {
      return request<GbpVerifyLocationResponse>(
        VERIFICATIONS_BASE_URL,
        `/${normalizeLocationName(locationName)}:verify`,
        {
          method: 'POST',
          body: { method, languageCode: DEFAULT_LANGUAGE },
        }
      );
    },

    async listVerifications(locationName: string): Promise<GbpVerification[]> {
      const response = await request<GbpVerificationsResponse>(
        VERIFICATIONS_BASE_URL,
        `/${normalizeLocationName(locationName)}/verifications`
      );
      return response.verifications ?? [];
    },

    async listCategories(params: GbpListCategoriesParams): Promise<GbpCategory[]> {
      const query: Record<string, string> = {};
      if (params.query) {
        // v1: busca por prefixo do displayName via filter (searchTerm não existe mais)
        query.filter = `displayName=${params.query}`;
      }
      if (params.regionCode) query.regionCode = params.regionCode;
      if (params.pageSize) query.pageSize = String(params.pageSize);
      query.languageCode = DEFAULT_LANGUAGE;
      query.view = 'BASIC';

      const response = await request<GbpCategoriesResponse>(BIZ_INFO_BASE_URL, '/categories', { query });
      return (response.categories ?? []).map(fromV1Category);
    },

    async getVoiceOfMerchantState(locationName: string): Promise<GbpVoiceOfMerchantState> {
      return request<GbpVoiceOfMerchantState>(
        VERIFICATIONS_BASE_URL,
        `/${normalizeLocationName(locationName)}/VoiceOfMerchantState`
      );
    },
  };

  return api;
}