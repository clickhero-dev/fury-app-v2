import { AppError } from '../middleware/errorHandler.js';
import { refreshAccessToken } from './google-oauth.js';
import { GOOGLE_ERROR_CODES } from '../schemas/google.schemas.js';

const GBP_ACCOUNT_MANAGEMENT_BASE_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const GBP_BUSINESS_INFORMATION_BASE_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const GBP_VERIFICATIONS_BASE_URL = 'https://mybusinessverifications.googleapis.com/v1';
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOCATION_READ_MASK = [
  'name',
  'title',
  'phoneNumbers',
  'websiteUri',
  'emailAddress',
  'categories',
  'address',
  'openInfo',
  'metadata',
].join(',');

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

export interface GbpLocation {
  name?: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  websiteUri?: string;
  emailAddress?: string;
  categories?: GbpCategory[];
  address?: GbpAddress;
  openInfo?: { periods?: GbpOpenPeriod[] };
  metadata?: {
    placeId?: string;
    mapsUri?: string;
    canOperateGoogleMyBusiness?: boolean;
    updateTime?: string;
  };
  verification?: { state?: string };
  profile?: { totalReviewCount?: number };
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
  locations?: GbpLocation[];
}

interface GbpSearchLocationsResponse {
  matchingLocations?: GbpLocationMatch[];
  googleLocations?: GbpLocationMatch[];
}

interface GbpVerificationOptionsResponse {
  options?: GbpVerificationOption[];
}

interface GbpVerificationsResponse {
  verifications?: GbpVerification[];
}

interface GbpCategoriesResponse {
  categories?: Array<GbpCategory & { parentCategory?: string }>;
}

interface GbpVerifyLocationResponse {
  status?: string;
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
  baseUrl?: string;
}

function normalizeLocationName(locationName: string): string {
  const locationId = locationName.match(/(?:^|\/)locations\/([^/]+)$/)?.[1];
  return locationId ? `locations/${locationId}` : locationName;
}

const MOCK_ACCOUNT_NAME = 'accounts/123456';
const MOCK_LOCATION_NAME = `${MOCK_ACCOUNT_NAME}/locations/789`;

const mockLocation: GbpLocation = {
  name: MOCK_LOCATION_NAME,
  title: 'Minha Empresa Ltda',
  phoneNumbers: { primaryPhone: '+5511999999999' },
  websiteUri: 'https://empresa.com.br',
  emailAddress: 'contato@empresa.com.br',
  categories: [{ categoryId: 'gcid:bakery', displayName: 'Padaria' }],
  address: {
    addressLines: ['Av. Paulista, 1000'],
    locality: 'São Paulo',
    administrativeArea: 'SP',
    postalCode: '01310-100',
    regionCode: 'BR',
    languageCode: 'pt-BR',
  },
  openInfo: {
    periods: [
      {
        openDay: 'MONDAY',
        openTime: { hours: 8, minutes: 0 },
        closeDay: 'MONDAY',
        closeTime: { hours: 18, minutes: 0 },
      },
    ],
  },
  metadata: {
    placeId: 'ChIJmockplaceid',
    mapsUri: 'https://maps.google.com/?cid=123456789',
    canOperateGoogleMyBusiness: true,
  },
  verification: { state: 'VERIFIED' },
  profile: { totalReviewCount: 12 },
};

const mockLocationMatch: GbpLocationMatch = {
  locationName: MOCK_LOCATION_NAME,
  placeId: 'ChIJmockplaceid',
  location: mockLocation,
};

const mockCategories: Array<GbpCategory & { parentCategory?: string }> = [
  { categoryId: 'gcid:bakery', displayName: 'Padaria' },
  { categoryId: 'gcid:bakery_patisserie', displayName: 'Padaria e Confeitaria' },
  { categoryId: 'gcid:coffee_shop', displayName: 'Cafeteria' },
  { categoryId: 'gcid:restaurant', displayName: 'Restaurante' },
];

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

function mockGbpRequest<T>(path: string, options: RequestOptions): T {
  const method = options.method ?? 'GET';

  if (method === 'POST' && (path === '/accounts:searchGoogleLocations' || path === '/googleLocations:search')) {
    return { matchingLocations: [mockLocationMatch] } as T;
  }

  if (method === 'GET' && path === '/accounts') {
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
    return { status: 'PENDING' } as T;
  }

  if (method === 'GET' && path.endsWith('/verifications')) {
    return { verifications: mockVerifications } as T;
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
}

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

  async function rawRequest<T>(path: string, options: RequestOptions, token: string): Promise<T> {
    const baseUrl = options.baseUrl ?? GBP_BUSINESS_INFORMATION_BASE_URL;
    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
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
      const code = response.status === 429
        ? GOOGLE_ERROR_CODES.GOOGLE_QUOTA_EXCEEDED
        : 'GOOGLE_API_ERROR';
      throw new GoogleApiError(response.status, code, message, {
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

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (isMock) {
      return mockGbpRequest<T>(path, options);
    }

    const token = await ensureFreshToken();

    try {
      return await rawRequest<T>(path, options, token);
    } catch (err) {
      if (isUnauthorizedError(err) && refreshToken) {
        await doRefresh();
        return rawRequest<T>(path, options, accessToken);
      }
      throw err;
    }
  }

  return {
    async listAccounts(): Promise<GbpAccount[]> {
      const response = await request<GbpAccountsResponse>('/accounts', {
        baseUrl: GBP_ACCOUNT_MANAGEMENT_BASE_URL,
      });
      return response.accounts ?? [];
    },

    async listLocations(accountName: string): Promise<GbpLocation[]> {
      const response = await request<GbpLocationsResponse>(`/${accountName}/locations`, {
        query: { pageSize: '100', readMask: LOCATION_READ_MASK },
      });
      return response.locations ?? [];
    },

    async createLocation(accountName: string, location: Partial<GbpLocation>): Promise<GbpLocation> {
      return request<GbpLocation>(`/${accountName}/locations`, { method: 'POST', body: location });
    },

    async searchGoogleLocations(params: GbpSearchGoogleLocationsParams): Promise<GbpLocationMatch[]> {
      const response = await request<GbpSearchLocationsResponse>('/googleLocations:search', {
        method: 'POST',
        body: {
          location: params.location ?? {},
          languageCode: params.languageCode ?? 'pt-BR',
          pageSize: params.pageSize ?? 3,
        },
      });
      return response.googleLocations ?? response.matchingLocations ?? [];
    },

    async getLocation(locationName: string): Promise<GbpLocation> {
      return request<GbpLocation>(`/${normalizeLocationName(locationName)}`, {
        query: { readMask: LOCATION_READ_MASK },
      });
    },

    async patchLocation(
      locationName: string,
      updates: Partial<GbpLocation>,
      fieldMask: string[]
    ): Promise<GbpLocation> {
      return request<GbpLocation>(`/${normalizeLocationName(locationName)}`, {
        method: 'PATCH',
        body: updates,
        query: { updateMask: fieldMask.join(',') },
      });
    },

    async fetchVerificationOptions(locationName: string): Promise<GbpVerificationOption[]> {
      const response = await request<GbpVerificationOptionsResponse>(
        `/${normalizeLocationName(locationName)}:fetchVerificationOptions`,
        { method: 'POST', baseUrl: GBP_VERIFICATIONS_BASE_URL }
      );
      return response.options ?? [];
    },

    async verifyLocation(locationName: string, method: string): Promise<GbpVerifyLocationResponse> {
      return request<GbpVerifyLocationResponse>(`/${normalizeLocationName(locationName)}:verify`, {
        method: 'POST',
        body: { method },
        baseUrl: GBP_VERIFICATIONS_BASE_URL,
      });
    },

    async listVerifications(locationName: string): Promise<GbpVerification[]> {
      const response = await request<GbpVerificationsResponse>(
        `/${normalizeLocationName(locationName)}/verifications`,
        { baseUrl: GBP_VERIFICATIONS_BASE_URL },
      );
      return response.verifications ?? [];
    },

    async listCategories(params: GbpListCategoriesParams): Promise<GbpCategory[]> {
      const query: Record<string, string> = {};
      if (params.query) query.filter = `displayName=${params.query}`;
      query.regionCode = params.regionCode ?? 'BR';
      query.languageCode = 'pt-BR';
      query.view = 'BASIC';
      if (params.pageSize) query.pageSize = String(params.pageSize);

      const response = await request<GbpCategoriesResponse>('/categories', { query });
      return (response.categories ?? []).map(({ parentCategory, ...category }) => ({
        ...category,
        parentId: parentCategory ?? undefined,
      }));
    },
  };
}