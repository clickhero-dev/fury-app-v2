/** Endereço do negócio no contrato da API Google Meu Negócio. */
export interface GoogleAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
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

/** Resposta de criação de perfil (US2). */
export interface GoogleCreateProfileResult {
  id: string;
  gbpLocationId: string;
  name: string;
  syncStatus: GoogleBusinessProfile['syncStatus'];
  verificationState: GoogleBusinessProfile['verificationState'];
  created: boolean;
}