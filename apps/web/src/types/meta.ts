export interface MetaAuthResponse {
  url: string;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number; // 1 = active, 2 = disabled
  currency?: string;
}

export interface MetaConnection {
  id: string;
  tenantId: string;
  metaUserId: string;
  accessToken: string;
  tokenExpiresAt: string | null;
  adAccounts: MetaAdAccount[];
  selectedAdAccountId: string | null;
  createdAt: string;
}
