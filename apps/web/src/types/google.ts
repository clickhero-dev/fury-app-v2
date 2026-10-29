/** Endereço do negócio no contrato da API Google Meu Negócio. */
export interface GoogleAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** Avaliação de qualidade/recência do perfil GBP (pré-envio). */
export type GoogleQualityGrade = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

export interface GoogleQualityReport {
  score: number; // 0-100
  grade: GoogleQualityGrade;
  complete: boolean;
  verified: boolean;
  outdated: boolean | null;
  lastUpdated: string | null;
  missingFields: string[]; // obrigatórios: 'name' | 'address' | 'phone'
  recommendations: string[]; // recomendados: 'website' | 'category' | 'hours'
  warnings: string[]; // PT-BR
}

/** Conexão OAuth com o Google salva no banco (tokens nunca chegam ao cliente). */
export interface GoogleConnection {
  id: string;
  googleUserId: string;
  accountId: string | null;
  accountName: string | null;
  tokenExpiresAt: string;
  connected: boolean;
}

/** Conta de negócio da GBP retornada por GET /google/accounts. */
export interface GoogleAccount {
  accountId: string;
  accountName: string;
}

export interface GoogleAccountsResult {
  accounts: GoogleAccount[];
  selectedAccountId: string | null;
}

/** Match de perfil existente retornado por GET /google/lookup. */
export interface GoogleLookupMatch {
  gbpLocationId: string;
  name: string;
  address: GoogleAddress;
  phone: string;
  verificationState: string;
  claimed: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  quality?: GoogleQualityReport | null;
}

/** Resultado da verificação de perfil existente (FR-002/FR-011). */
export interface GoogleLookupResult {
  found: boolean;
  matches: GoogleLookupMatch[];
  duplicateAlert: boolean;
}

/** Horário de funcionamento no formato do Google Business Profile. */
export interface GoogleBusinessHours {
  [day: string]: { open: string; close: string }[] | undefined;
}

/** Dados do negócio salvos em business_profile_settings (FR-007). */
export interface GoogleBusinessSettings {
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

/** Payload de salvamento dos dados do negócio (PUT /google/settings). */
export interface GoogleBusinessSettingsInput {
  name: string;
  address: GoogleAddress;
  phone: string;
  email: string;
  website: string;
  categoryId: string | null;
  hours: GoogleBusinessHours | null;
}

/** Categoria do catálogo oficial da GBP (GET /google/categories). */
export interface GoogleCategory {
  categoryId: string;
  displayName: string;
  parentId: string | null;
}

/** Perfil espelhado da GBP para o tenant. */
export interface GoogleBusinessProfile {
  id: string;
  gbpLocationId: string;
  name: string;
  address: GoogleAddress;
  phone: string | null;
  email: string | null;
  website: string | null;
  categoryId: string | null;
  categoryDisplayName: string | null;
  hours: GoogleBusinessHours | null;
  photos: string[];
  verificationState: 'UNVERIFIED' | 'VERIFIED';
  syncStatus:
    | 'not_connected'
    | 'connected'
    | 'no_profile'
    | 'awaiting_verification'
    | 'verified'
    | 'syncing'
    | 'synced'
    | 'error';
  lastSyncedAt: string | null;
}

/** Entrada de histórico de sincronização (google_sync_logs). */
export interface GoogleSyncLog {
  id: string;
  operation: string;
  status: string;
  message: string | null;
  createdAt: string;
}

/** Resposta paginada de histórico de sincronização (GET /profiles/:id/sync-logs). */
export interface GoogleSyncLogsResult {
  logs: GoogleSyncLog[];
}

/** Resposta de criação de perfil (US2). */
export interface GoogleCreateProfileResult {
  id: string;
  gbpLocationId: string;
  name: string;
  syncStatus: GoogleBusinessProfile['syncStatus'];
  verificationState: GoogleBusinessProfile['verificationState'];
  created: boolean;
  verificationInstructions?: string;
}

/** Método de verificação elegível (GET /profiles/:id/verification). */
export interface GoogleVerificationOption {
  method: 'POSTAL' | 'PHONE' | 'EMAIL';
  description: string;
}

/** Status e opções de verificação do perfil (US2). */
export interface GoogleVerificationResult {
  verificationState: GoogleBusinessProfile['verificationState'];
  options: GoogleVerificationOption[];
  instructions: string;
}

/** Payload para concluir a verificação (POST /profiles/:id/verification/complete). */
export interface GoogleCompleteVerificationInput {
  method: 'POSTAL' | 'PHONE' | 'EMAIL';
}

/** Resultado da conclusão da verificação (US2). */
export interface GoogleCompleteVerificationResult {
  verificationState: GoogleBusinessProfile['verificationState'];
  awaitingPin?: boolean;
  postalGuidance?: boolean;
  syncStatus?: GoogleBusinessProfile['syncStatus'];
  instructions?: string;
}

/** Resultado de upload/remoção de foto (US3). */
export interface GooglePhotoUploadResult {
  photos: string[];
  associatedManually: true;
}