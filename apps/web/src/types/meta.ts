export interface MetaAuthResponse {
  url: string;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
}

export interface MetaConnection {
  id: string;
  accountId?: string;
  businessAccountId: string;
  accountName: string;
  connected?: boolean;
  adAccounts: MetaAdAccount[];
  status: 'active' | 'inactive';
  connectedAt: string;
  tokenExpiredAt: string;
  isTokenValid: boolean;
}
