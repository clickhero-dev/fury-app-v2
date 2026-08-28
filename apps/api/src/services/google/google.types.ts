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

export type OAuthContext = 'onboarding' | 'settings';

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
}

export interface GoogleAccount {
  accountId: string;
  accountName: string;
}

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