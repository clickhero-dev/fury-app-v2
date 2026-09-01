import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { MetaRepository } from '../../repository/meta.repository.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getBusinessAdAccounts,
  getBusinessOwnedPages,
  getMetaUserId,
  getPageWhatsappNumbers,
  getWhatsappNumbersForAssets,
  getUserAdAccounts,
  getUserBusinesses,
  getUserFacebookPages,
  getUserPermissions,
  type MetaAdAccount,
  type MetaBusiness,
  type MetaFacebookPage,
  type MetaOwnedPage,
  type MetaWhatsappNumber,
} from '../../lib/meta-api.js';
import { addSyncJob } from '../../lib/sync-jobs.js';

const META_OAUTH_URL = 'https://www.facebook.com/v20.0/dialog/oauth';

// Ordem dos escopos reflete a dependencia entre as etapas de consentimento:
// Business Manager -> Paginas (filtradas pelas BMs escolhidas) -> Instagram
// (depende das Paginas) -> Conta de Anuncios. A Meta NAO garante que a UI de
// consentimento respeite essa ordem, mas reordenar o parametro scope e a
// unica alavanca disponivel via API para tentar influenciar o agrupamento
// das telas exibidas ao usuario.
const META_SCOPES = [
  // 1) Business Manager
  'business_management',
  // 2) Paginas (vinculadas as BMs selecionadas)
  'pages_show_list',
  'pages_read_engagement',
  // 2b) WhatsApp Business (WABAs vinculadas as Paginas/BM) — necessario para
  // listar numeros WhatsApp em campanhas com destino WHATSAPP
  'whatsapp_business_management',
  // 3) Instagram (depende das Paginas)
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_content_publish',
  // 4) Conta de Anuncios
  'ads_management',
  'ads_read',
];

export type OAuthContext = 'onboarding' | 'settings';

interface OAuthStatePayload {
  tenantId: string;
  context: OAuthContext;
  returnUrl?: string;
  frontendUrl?: string;
}

const RETURN_URLS: Record<OAuthContext, string> = {
  onboarding: '/onboarding/conectar-meta?connected=true',
  settings: '/configuracoes/integracoes?connected=true',
};

export interface StoredMetaConnection {
  id: string;
  tenantId: string;
  metaUserId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  adAccounts: MetaAdAccount[];
  selectedAdAccountId: string | null;
  createdAt: Date;
}

// ── helpers puros (sem dependência de repo) ────────────────────────────────
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(500, 'MISSING_ENV', `Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

function getAesKey(): Buffer {
  const jwtSecret = getRequiredEnv('JWT_SECRET');
  return crypto.createHash('sha256').update(jwtSecret).digest();
}

function encryptToken(token: string): string {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(encryptedPayload: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new AppError(500, 'TOKEN_DECRYPT_ERROR', 'Formato de token criptografado invalido.');
  }

  const key = getAesKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function signOAuthState(payload: OAuthStatePayload): string {
  const secret = getRequiredEnv('JWT_SECRET');
  return jwt.sign(payload, secret, { expiresIn: '10m' });
}

function verifyOAuthState(state: string): OAuthStatePayload {
  try {
    const secret = getRequiredEnv('JWT_SECRET');
    return jwt.verify(state, secret) as OAuthStatePayload;
  } catch {
    throw new AppError(401, 'INVALID_OAUTH_STATE', 'State OAuth invalido ou expirado.');
  }
}

/**
 * Origens de frontend aceitas para o redirect pós-OAuth. Sem configuração
 * explícita, qualquer origin http(s) válido é aceito por padrão (o fluxo NÃO
 * depende de setup). ALLOWED_FRONTEND_ORIGINS='a,b' restringe a lista.
 */
function isAllowedFrontendOrigin(origin: string): boolean {
  const explicit = process.env.ALLOWED_FRONTEND_ORIGINS
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (explicit && explicit.length > 0) {
    return explicit.includes(origin);
  }
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function maskToken(encryptedToken: string): string {
  const rawToken = decryptToken(encryptedToken);
  const last4 = rawToken.slice(-4);
  return `****${last4}`;
}

function getTokenExpiration(expiresIn: number): Date | null {
  if (!expiresIn || expiresIn <= 0) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000);
}

export interface TenantAssetSelection {
  businessIds: string[];
  pageIds: string[];
  adAccountIds: string[];
  whatsappNumberIds: string[];
}

export interface TenantBusinessAdAccount {
  adAccountId: string;
  name: string;
  status: number;
  businessId: string;
}

export interface TenantWhatsappNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
  businessId?: string;
  pageId?: string;
}

export interface ResolvedAssetSelectionPage {
  pageId: string;
  name: string;
  hasInstagram: boolean;
  instagramUserId: string | null;
  instagramUsername: string | null;
  hasWhatsApp: boolean;
}

export interface ResolvedAssetSelectionAdAccount {
  adAccountId: string;
  name: string;
}

export interface ResolvedAssetSelectionWhatsappNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
}

export interface ResolvedAssetSelectionBusiness {
  businessId: string;
  name: string;
}

export interface ResolvedTenantAssetSelection {
  pages: ResolvedAssetSelectionPage[];
  adAccounts: ResolvedAssetSelectionAdAccount[];
  whatsappNumbers: ResolvedAssetSelectionWhatsappNumber[];
  businesses: ResolvedAssetSelectionBusiness[];
}

interface MetaServiceDeps {
  metaApi: {
    exchangeCodeForToken: typeof exchangeCodeForToken;
    exchangeForLongLivedToken: typeof exchangeForLongLivedToken;
    getBusinessAdAccounts: typeof getBusinessAdAccounts;
    getBusinessOwnedPages: typeof getBusinessOwnedPages;
    getMetaUserId: typeof getMetaUserId;
    getPageWhatsappNumbers: typeof getPageWhatsappNumbers;
    getWhatsappNumbersForAssets: typeof getWhatsappNumbersForAssets;
    getUserAdAccounts: typeof getUserAdAccounts;
    getUserBusinesses: typeof getUserBusinesses;
    getUserFacebookPages: typeof getUserFacebookPages;
    getUserPermissions: typeof getUserPermissions;
  };
  addSyncJob: typeof addSyncJob;
}

/**
 * MetaService — classe pura de domínio com DI no construtor
 * (repoFactory + externos meta-api/sync-jobs).
 */
export class MetaService {
  constructor(
    private readonly repoFactory: (tenantId: string) => MetaRepository = (t) => new MetaRepository(t),
    private readonly deps: MetaServiceDeps = {
      metaApi: {
        exchangeCodeForToken,
        exchangeForLongLivedToken,
        getBusinessAdAccounts,
        getBusinessOwnedPages,
        getMetaUserId,
        getPageWhatsappNumbers,
        getWhatsappNumbersForAssets,
        getUserAdAccounts,
        getUserBusinesses,
        getUserFacebookPages,
        getUserPermissions,
      },
      addSyncJob,
    },
  ) {}

  private repo(t: string): MetaRepository {
    return this.repoFactory(t);
  }

  private getRedirectUri(): string {
    return (
      process.env.META_REDIRECT_URI ??
      `${process.env.APP_URL ?? `https://${process.env.DOMAIN ?? 'clickhero-fury-api.u7pe19.easypanel.host'}`}/api/meta/auth/callback`
    );
  }

  private async getTenantAccessToken(tenantId: string): Promise<string> {
    const connection = await this.repo(tenantId).findLatestMetaConnection();

    if (!connection) {
      throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
    }

    return decryptToken(connection.accessToken);
  }

  generateMetaAuthUrl(
    tenantId: string,
    context: OAuthContext = 'onboarding',
    frontendUrl?: string
  ): string {
    const appId = getRequiredEnv('META_APP_ID');
    const redirectUri = this.getRedirectUri();
    const state = signOAuthState({
      tenantId,
      context,
      returnUrl: RETURN_URLS[context],
      // Origin onde o usuário iniciou o fluxo: embutida no state para o callback
      // redirecionar de volta ao MESMO ambiente (localhost/HMG/prod), sem
      // depender de FRONTEND_URL fixo.
      frontendUrl: frontendUrl && isAllowedFrontendOrigin(frontendUrl) ? frontendUrl : undefined,
    });

    const authUrl = new URL(META_OAUTH_URL);
    authUrl.searchParams.set('client_id', appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', META_SCOPES.join(','));
    authUrl.searchParams.set('state', state);

    // Alternativa para forcar a ordem/agrupamento das telas de consentimento:
    // o fluxo "Facebook Login for Business" aceita um parametro `config_id`
    // (criado no Meta App Dashboard, em Facebook Login for Business > Configurations),
    // que permite definir explicitamente quais permissoes/etapas (BM, Paginas,
    // Contas de Anuncio) sao solicitadas e em qual ordem. Nao usado atualmente
    // porque exige criar e manter essa configuracao no painel da Meta; se a
    // ordenacao do array META_SCOPES nao for suficiente, considerar migrar
    // para esse fluxo definindo authUrl.searchParams.set('config_id', '<id>')
    // no lugar de `scope`.

    return authUrl.toString();
  }

  async handleMetaOAuthCallback(
    code: string,
    state: string,
  ): Promise<{ tenantId: string; context: OAuthContext; returnUrl: string; frontendUrl?: string }> {
    const { tenantId, context, returnUrl, frontendUrl } = verifyOAuthState(state);
    console.log(`[OAuth] state verificado — tenantId=${tenantId} context=${context}`);
    const appId = getRequiredEnv('META_APP_ID');
    const appSecret = getRequiredEnv('META_APP_SECRET');
    const redirectUri = this.getRedirectUri();
    console.log(`[OAuth] redirectUri=${redirectUri} appId=${appId}`);

    let shortToken: any;
    try {
      shortToken = await this.deps.metaApi.exchangeCodeForToken({
        clientId: appId,
        clientSecret: appSecret,
        redirectUri,
        code,
      });
      console.log(`[OAuth] short token obtido — expires_in=${shortToken.expires_in}`);
    } catch (err: any) {
      console.error(`[OAuth] FALHA ao trocar code por token — redirectUri=${redirectUri}`, err?.message || err);
      throw err;
    }

    let longLivedToken: any;
    try {
      longLivedToken = await this.deps.metaApi.exchangeForLongLivedToken({
        clientId: appId,
        clientSecret: appSecret,
        shortLivedToken: shortToken.access_token,
      });
      console.log(`[OAuth] long-lived token obtido — expires_in=${longLivedToken.expires_in}`);
    } catch (err: any) {
      console.error(`[OAuth] FALHA ao trocar por long-lived token`, err?.message || err);
      throw err;
    }

    const metaUserId = await this.deps.metaApi.getMetaUserId(longLivedToken.access_token);
    console.log(`[OAuth] metaUserId=${metaUserId}`);
    const encryptedToken = encryptToken(longLivedToken.access_token);
    const tokenExpiresAt = getTokenExpiration(longLivedToken.expires_in);

    const repo = this.repo(tenantId);
    const existing = await repo.findLatestMetaConnection();

    const resolvedReturnUrl = returnUrl ?? RETURN_URLS[context];

    let connectionId: string;

    // Preserva a conta de anúncios selecionada ANTES de limpar adAccounts,
    // para que após o refresh possamos restaurá-la caso ainda exista.
    let oldSelectedAdAccountId: string | null = null;

    if (existing) {
      oldSelectedAdAccountId = existing.selectedAdAccountId;
      await repo.patchMetaConnection(existing.id, {
        metaUserId,
        accessToken: encryptedToken,
        tokenExpiresAt,
        adAccounts: [],
        // ponytail: não limpamos selectedAdAccountId aqui — deixamos a lógica
        // após o refresh decidir: mantém a anterior se ainda existir, ou pega a
        // primeira disponível. Assim o usuário não precisa re-selecionar a conta
        // toda vez que reconecta o Meta.
        updatedAt: new Date(),
      });
      connectionId = existing.id;
    } else {
      const inserted = await repo.createMetaConnection({
        tenantId,
        metaUserId,
        accessToken: encryptedToken,
        tokenExpiresAt,
        adAccounts: [],
      });
      connectionId = inserted.id;
    }

    console.log(`[OAuth] conexão salva, id=${connectionId}`);

    try {
      const { accounts: adAccounts, ignoredBusinessIds } = await this.deps.metaApi.getUserAdAccounts(
        longLivedToken.access_token
      );

      if (ignoredBusinessIds.length > 0) {
        console.warn(
          `[OAuth] busca de ativos falhou parcialmente: ${JSON.stringify(ignoredBusinessIds)}`
        );
      }

      if (adAccounts.length > 0) {
        // Restaura a conta anterior se ainda existir no refresh, senão pega a primeira
        const selectedAdAccountId =
          oldSelectedAdAccountId && adAccounts.some((a) => a.id === oldSelectedAdAccountId)
            ? oldSelectedAdAccountId
            : adAccounts[0].id;

        await repo.patchMetaConnection(connectionId, { adAccounts, selectedAdAccountId, updatedAt: new Date() });
        await this.deps.addSyncJob({ tenantId, metaUserId, adAccounts });
      }
    } catch (error) {
      console.error('[OAuth] busca de ativos falhou completamente:', error);
    }

    return { tenantId, context, returnUrl: resolvedReturnUrl, frontendUrl };
  }

  getTenantAssetSelection(tenantId: string): Promise<TenantAssetSelection | null> {
    return this.resolveAssetSelection(tenantId);
  }

  private async resolveAssetSelection(tenantId: string): Promise<TenantAssetSelection | null> {
    const connection = await this.repo(tenantId).findLatestMetaConnection();

    if (!connection) return null;

    return {
      businessIds: (connection.selectedBusinessIds as string[] | null) ?? [],
      pageIds: (connection.selectedPageIds as string[] | null) ?? [],
      adAccountIds: (connection.selectedAdAccountIds as string[] | null) ?? [],
      whatsappNumberIds: (connection.selectedWhatsappNumberIds as string[] | null) ?? [],
    };
  }

  async saveTenantAssetSelection(
    tenantId: string,
    selection: TenantAssetSelection,
  ): Promise<void> {
    const repo = this.repo(tenantId);
    const connection = await repo.findLatestMetaConnection();

    if (!connection) {
      throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
    }

    // Preserva a conta de anuncios ja escolhida pelo usuario (via "Conta ativa
    // para metricas" em Configuracoes > Integracoes) se ela ainda estiver entre
    // as contas selecionadas no onboarding. Sobrescrever sempre com
    // adAccountIds[0] fazia createCampaignFromWizard usar uma conta diferente
    // da que o usuario configurou explicitamente.
    const selectedAdAccountId =
      connection.selectedAdAccountId && selection.adAccountIds.includes(connection.selectedAdAccountId)
        ? connection.selectedAdAccountId
        : selection.adAccountIds[0] ?? connection.selectedAdAccountId;

    await repo.patchMetaConnection(connection.id, {
        selectedBusinessIds: selection.businessIds,
        selectedPageIds: selection.pageIds,
        selectedAdAccountIds: selection.adAccountIds,
        selectedWhatsappNumberIds: selection.whatsappNumberIds,
        selectedAdAccountId,
        updatedAt: new Date(),
      });
  }

  async getTenantBusinesses(tenantId: string): Promise<MetaBusiness[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);
    return this.deps.metaApi.getUserBusinesses(accessToken);
  }

  getTenantPagesByBusiness(tenantId: string, businessIds: string[]): Promise<MetaOwnedPage[]> {
    return this.resolvePagesByBusiness(tenantId, businessIds);
  }

  private async resolvePagesByBusiness(tenantId: string, businessIds: string[]): Promise<MetaOwnedPage[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);

    const pagesByBusiness = await Promise.all(
      businessIds.map((businessId) => this.deps.metaApi.getBusinessOwnedPages(businessId, accessToken))
    );

    const seen = new Set<string>();
    const pages: MetaOwnedPage[] = [];
    for (const list of pagesByBusiness) {
      for (const page of list) {
        if (!seen.has(page.pageId)) {
          seen.add(page.pageId);
          pages.push(page);
        }
      }
    }

    return pages;
  }

  getTenantAdAccountsByBusiness(
    tenantId: string,
    businessIds: string[],
  ): Promise<TenantBusinessAdAccount[]> {
    return this.resolveAdAccountsByBusiness(tenantId, businessIds);
  }

  private async resolveAdAccountsByBusiness(
    tenantId: string,
    businessIds: string[],
  ): Promise<TenantBusinessAdAccount[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);

    const accountsByBusiness = await Promise.all(
      businessIds.map(async (businessId) => {
        const accounts = await this.deps.metaApi.getBusinessAdAccounts(businessId, accessToken);
        return accounts.map((account) => ({
          adAccountId: account.id,
          name: account.name,
          status: account.account_status,
          businessId,
        }));
      })
    );

    const seen = new Set<string>();
    const accounts: TenantBusinessAdAccount[] = [];
    for (const list of accountsByBusiness) {
      for (const account of list) {
        if (!seen.has(account.adAccountId)) {
          seen.add(account.adAccountId);
          accounts.push(account);
        }
      }
    }

    return accounts;
  }

  getTenantWhatsappNumbers(
    tenantId: string,
    { businessIds, pageIds }: { businessIds: string[]; pageIds: string[] },
  ): Promise<TenantWhatsappNumber[]> {
    return this.resolveWhatsappNumbers(tenantId, { businessIds, pageIds });
  }

  private async resolveWhatsappNumbers(
    tenantId: string,
    { businessIds, pageIds }: { businessIds: string[]; pageIds: string[] },
  ): Promise<TenantWhatsappNumber[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);
    const numbers = await this.deps.metaApi.getWhatsappNumbersForAssets(accessToken, { businessIds, pageIds });

    return numbers.map(({ phoneNumberId, displayPhoneNumber, businessId, pageId }) => ({
      phoneNumberId,
      displayPhoneNumber,
      businessId,
      pageId,
    }));
  }

  /** @deprecated Use getTenantWhatsappNumbers — mantido para compatibilidade. */
  getTenantWhatsappByPages(tenantId: string, pageIds: string[]): Promise<TenantWhatsappNumber[]> {
    return this.getTenantWhatsappNumbers(tenantId, { businessIds: [], pageIds });
  }

  async getTenantMetaScopes(tenantId: string): Promise<string[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);
    return this.deps.metaApi.getUserPermissions(accessToken);
  }

  /**
   * Lista as Paginas do Facebook vinculadas a conexao Meta do tenant. Se o tenant
   * ja tiver uma selecao de Paginas persistida (fluxo de selecao de ativos), o
   * resultado e filtrado para conter apenas as Paginas selecionadas.
   */
  async getTenantFacebookPages(tenantId: string): Promise<MetaFacebookPage[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);
    const pages = await this.deps.metaApi.getUserFacebookPages(accessToken, { includeWhatsApp: true });

    const selection = await this.getTenantAssetSelection(tenantId);
    if (selection && selection.pageIds.length > 0) {
      return pages.filter((page) => selection.pageIds.includes(page.pageId));
    }

    return pages;
  }

  /**
   * Lista os numeros WhatsApp Business vinculados a uma Pagina do tenant. Se o
   * tenant ja tiver uma selecao de numeros WhatsApp persistida, o resultado e
   * filtrado para conter apenas os numeros selecionados.
   */
  async getTenantPageWhatsappNumbers(
    tenantId: string,
    pageId: string,
  ): Promise<MetaWhatsappNumber[]> {
    const accessToken = await this.getTenantAccessToken(tenantId);
    const numbers = await this.deps.metaApi.getPageWhatsappNumbers(pageId, accessToken);

    const selection = await this.getTenantAssetSelection(tenantId);
    if (selection && selection.whatsappNumberIds.length > 0) {
      return numbers.filter((number) => selection.whatsappNumberIds.includes(number.phoneNumberId));
    }

    return numbers;
  }

  /**
   * Resolve a selecao de ativos persistida do tenant (BMs, Paginas, Contas de
   * Anuncio e numeros WhatsApp) em detalhes atualizados via Graph API, para uso
   * no Wizard de Campanha (que nao deve pedir nova selecao ao usuario).
   */
  async getResolvedTenantAssetSelection(tenantId: string): Promise<ResolvedTenantAssetSelection> {
    const connection = await this.repo(tenantId).findLatestMetaConnection();

    if (!connection) {
      throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
    }

    const accessToken = decryptToken(connection.accessToken);
    const selectedPageIds = (connection.selectedPageIds as string[] | null) ?? [];
    const selectedAdAccountIds = (connection.selectedAdAccountIds as string[] | null) ?? [];
    const selectedWhatsappNumberIds = (connection.selectedWhatsappNumberIds as string[] | null) ?? [];
    const selectedBusinessIds = (connection.selectedBusinessIds as string[] | null) ?? [];

    const [allPages, allBusinesses] = await Promise.all([
      this.deps.metaApi.getUserFacebookPages(accessToken, { includeWhatsApp: true }),
      selectedBusinessIds.length > 0 ? this.deps.metaApi.getUserBusinesses(accessToken) : Promise.resolve([]),
    ]);

    const pages: ResolvedAssetSelectionPage[] = allPages
      .filter((page) => selectedPageIds.length === 0 || selectedPageIds.includes(page.pageId))
      .map((page) => ({
        pageId: page.pageId,
        name: page.name,
        hasInstagram: page.hasInstagram,
        instagramUserId: page.instagramUserId,
        instagramUsername: page.instagramUsername,
        hasWhatsApp: page.hasWhatsApp,
      }));

    const allAdAccounts = (connection.adAccounts as MetaAdAccount[]) ?? [];
    const adAccounts: ResolvedAssetSelectionAdAccount[] = allAdAccounts
      .filter((account) => selectedAdAccountIds.length === 0 || selectedAdAccountIds.includes(account.id))
      .map((account) => ({ adAccountId: account.id, name: account.name }));

    const businesses: ResolvedAssetSelectionBusiness[] = allBusinesses
      .filter((business) => selectedBusinessIds.includes(business.id))
      .map((business) => ({ businessId: business.id, name: business.name }));

    let whatsappNumbers: ResolvedAssetSelectionWhatsappNumber[] = [];
    if (selectedWhatsappNumberIds.length > 0) {
      // Filtra apenas paginas que tem WhatsApp para evitar erro 400
      // "Tried accessing nonexisting field (whatsapp_business_account)"
      const whatsappPageIds = selectedPageIds.filter(
        (pageId) => allPages.find((p) => p.pageId === pageId)?.hasWhatsApp
      );
      const numbers = await this.deps.metaApi.getWhatsappNumbersForAssets(accessToken, {
        businessIds: selectedBusinessIds,
        pageIds: whatsappPageIds,
      });
      whatsappNumbers = numbers
        .filter((number) => selectedWhatsappNumberIds.includes(number.phoneNumberId))
        .map((number) => ({ phoneNumberId: number.phoneNumberId, displayPhoneNumber: number.displayPhoneNumber }));
    }

    return { pages, adAccounts, whatsappNumbers, businesses };
  }

  async getTenantMetaConnections(tenantId: string): Promise<StoredMetaConnection[]> {
    // Assim como handleMetaOAuthCallback, createCampaignFromWizard e
    // getResolvedTenantAssetSelection, tratamos apenas a conexao mais recente do
    // tenant como canonica. Um findMany aqui retornaria tambem linhas antigas/
    // obsoletas (ex.: de reconexoes anteriores), cujo tokenExpiresAt pode estar
    // vencido, fazendo a UI exibir um card "Pausado" permanente que nao reflete
    // a conexao realmente em uso.
    const connection = await this.repo(tenantId).findLatestMetaConnection();

    if (!connection) {
      return [];
    }

    const allAdAccounts = (connection.adAccounts as MetaAdAccount[]) || [];
    const selectedAdAccountIds = (connection.selectedAdAccountIds as string[] | null) ?? [];
    const adAccounts =
      selectedAdAccountIds.length > 0
        ? allAdAccounts.filter((account) => selectedAdAccountIds.includes(account.id))
        : allAdAccounts;

    return [
      {
        id: connection.id,
        tenantId: connection.tenantId,
        metaUserId: connection.metaUserId,
        accessToken: maskToken(connection.accessToken),
        tokenExpiresAt: connection.tokenExpiresAt,
        adAccounts,
        selectedAdAccountId: connection.selectedAdAccountId ?? null,
        createdAt: connection.createdAt,
      },
    ];
  }

  async deleteTenantMetaConnection(tenantId: string, connectionId: string): Promise<void> {
    const repo = this.repo(tenantId);
    const existing = await repo.findMetaConnectionById(connectionId);

    if (!existing) {
      throw new AppError(404, 'META_CONNECTION_NOT_FOUND', 'Conexao Meta nao encontrada para este tenant.');
    }

    await repo.deleteMetaConnection(connectionId);
  }

  async selectAdAccount(
    tenantId: string,
    connectionId: string,
    adAccountId: string,
  ): Promise<string> {
    const repo = this.repo(tenantId);
    const connection = await repo.findMetaConnectionById(connectionId);

    if (!connection) {
      throw new AppError(404, 'META_CONNECTION_NOT_FOUND', 'Conexao Meta nao encontrada para este tenant.');
    }

    const adAccounts = (connection.adAccounts as MetaAdAccount[]) ?? [];
    const exists = adAccounts.some((a) => a.id === adAccountId);
    if (!exists) {
      throw new AppError(400, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncios nao pertence a esta conexao.');
    }

    await repo.patchMetaConnection(connectionId, { selectedAdAccountId: adAccountId });

    return adAccountId;
  }
}

export const metaService = new MetaService();

/**
 * Alias de módulo que delega ao singleton `metaService`, preservando consumidores
 * que importavam `getResolvedTenantAssetSelection` como função (campaigns.service).
 */
export function getResolvedTenantAssetSelection(tenantId: string): Promise<ResolvedTenantAssetSelection> {
  return metaService.getResolvedTenantAssetSelection(tenantId);
}