/** Resposta da API com a URL de autenticação OAuth do Meta. */
export interface MetaAuthResponse {
  url: string;
}

/** Conta de anúncios do Meta vinculada ao usuário. */
export interface MetaAdAccount {
  id: string;
  name: string;
  /** Status da conta: 1 = ativa, 2 = desativada. */
  account_status: number;
  currency?: string;
  timezone_name?: string;
}

/** Conexão OAuth com o Meta Ads salva no banco. */
export interface MetaConnection {
  id: string;
  tenantId: string;
  metaUserId: string;
  /** Token de acesso OAuth criptografado em repouso no banco. */
  accessToken: string;
  tokenExpiresAt: string | null;
  /** Contas de anúncio disponíveis para este usuário Meta. */
  adAccounts: MetaAdAccount[];
  /** ID da conta de anúncio selecionada pelo tenant para uso na plataforma. */
  selectedAdAccountId: string | null;
  createdAt: string;
}