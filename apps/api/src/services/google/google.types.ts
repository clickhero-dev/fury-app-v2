/**
 * Tipos/DTOs do domínio Google Meu Negócio (GBP).
 * Movidos de google.service.ts para manter o service enxuto (refatoração de
 * modularização). Importação type-only — sem runtime.
 */
import type {
  createGoogleApiClient,
  GbpCategory,
  GbpLocation,
  GbpLocationMatch,
  GoogleApiClient,
} from '../../lib/google-api.js';
import type { exchangeCodeForToken, getGoogleOAuthConfig, revokeGoogleToken } from '../../lib/google-oauth.js';
import type { uploadAsset, deleteAsset } from '../storage/storage.service.js';
import type { GoogleQualityReport } from './google.quality.js';
import type {
  CategoryAction,
  OpenStatus,
  StrengthReport,
  Suggestion,
  WeeklyHoursDay,
} from './google.overview.js';

/** Painel do dono "Sua empresa no Google" (spec 015). */
export interface GoogleOwnerOverview {
  profile: {
    id: string;
    name: string;
    logoUrl: string | null;
    verified: boolean;
    categoryName: string | null;
    syncStatus: GoogleProfileResult['syncStatus'];
  };
  interactions: { total: number; periodDays: number } | null;
  strength: StrengthReport;
  actions: CategoryAction[];
  suggestions: Suggestion[];
  reviewLink: string | null;
}

/** Prévia do cartão público; textos vêm crus do Google: renderizar como texto, nunca HTML. */
export interface GooglePublicCard {
  name: string;
  categoryName: string | null;
  additionalCategories: string[];
  rating: { average: number; count: number } | null;
  priceRange: string | null;
  addressLine: string;
  phone: string | null;
  website: string | null;
  description: string | null;
  weeklyHours: WeeklyHoursDay[];
  openStatus: OpenStatus;
  photos: Array<{ url: string; source: 'ady_local' | 'google'; category: string | null }>;
  photosNotice: 'ady_local' | null;
  tabs: string[];
  mapsUri: string | null;
}

export interface GoogleAccountLocationItem {
  gbpLocationId: string;
  name: string;
  addressLine: string;
  active: boolean;
}

export interface GoogleAccountLocationsResult {
  accountName: string | null;
  locations: GoogleAccountLocationItem[];
}

export type OAuthContext = 'onboarding' | 'settings' | 'ads';

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

export interface GoogleConnectionPublic {
  id: string;
  googleUserId: string;
  accountId: string | null;
  accountName: string | null;
  tokenExpiresAt: string;
  connected: boolean;
  /** Escopos OAuth concedidos (URLs completas). */
  scopes: string[];
  /** true quando a conta Google Ads está conectada (escopo adwords concedido). */
  adsConnected: boolean;
}

export interface GoogleAccount {
  accountId: string;
  accountName: string;
}

// ── Google Ads (Fluxo 3 — promoção do GBP) ──────────────────────────────

export interface GoogleAdsCampaignResult {
  campaignId: number;
  budgetId: number;
  assetSetId: number;
}

/** Intervalo aceito de verba mensal (BRL). */
export const GOOGLE_ADS_MIN_MONTHLY_BUDGET = 30;
export const GOOGLE_ADS_MAX_MONTHLY_BUDGET = 50_000;

export interface GoogleLookupMatch {
  gbpLocationId: string;
  name: string;
  address: GoogleAddress;
  phone: string;
  verificationState: string;
  claimed: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Relatório de qualidade/recência derivado da location completa do match (pré-envio). Null quando o match não traz location. */
  quality?: GoogleQualityReport | null;
}

export interface GoogleLookupResult {
  found: boolean;
  matches: GoogleLookupMatch[];
  duplicateAlert: boolean;
  /** Perfil espelhado persistido do tenant (null quando ainda não criado/recuperado). */
  profile: GoogleProfileResult | null;
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

export interface GooglePhotoUploadResult {
  photos: string[];
  associatedManually: true;
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

/** Tipos reexportados de lib/google-api para conveniência do domínio. */
export type {
  GbpCategory,
  GbpLocation,
  GbpLocationMatch,
  GoogleApiClient,
};