import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db, metaConnections } from '../lib/db.js';
import { AppError } from '../middleware/errorHandler.js';
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
} from '../lib/meta-api.js';
import { addSyncJob } from '../lib/sync-jobs.js';

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
}

const RETURN_URLS: Record<OAuthContext, string> = {
  onboarding: '/onboarding/conectar-meta?connected=true',
  settings: '/configuracoes/integracoes?connected=true',
};

interface StoredMetaConnection {
  id: string;
  tenantId: string;
  metaUserId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  adAccounts: MetaAdAccount[];
  selectedAdAccountId: string | null;
  createdAt: Date;
}

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

export function generateMetaAuthUrl(tenantId: string, context: OAuthContext = 'onboarding'): string {
  const appId = getRequiredEnv('META_APP_ID');
  const redirectUri =
    process.env.META_REDIRECT_URI ??
    `${process.env.APP_URL ?? `https://${process.env.DOMAIN ?? 'clickhero-fury-api.u7pe19.easypanel.host'}`}/api/meta/auth/callback`;
  const state = signOAuthState({ tenantId, context, returnUrl: RETURN_URLS[context] });

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

export async function handleMetaOAuthCallback(
  code: string,
  state: string,
): Promise<{ tenantId: string; context: OAuthContext; returnUrl: string }> {
  const { tenantId, context, returnUrl } = verifyOAuthState(state);
  console.log(`[OAuth] state verificado — tenantId=${tenantId} context=${context}`);
  const appId = getRequiredEnv('META_APP_ID');
  const appSecret = getRequiredEnv('META_APP_SECRET');
  const redirectUri =
    process.env.META_REDIRECT_URI ??
    `${process.env.APP_URL ?? `https://${process.env.DOMAIN ?? 'clickhero-fury-api.u7pe19.easypanel.host'}`}/api/meta/auth/callback`;
  console.log(`[OAuth] redirectUri=${redirectUri} appId=${appId}`);

  let shortToken: any;
  try {
    shortToken = await exchangeCodeForToken({
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
    longLivedToken = await exchangeForLongLivedToken({
      clientId: appId,
      clientSecret: appSecret,
      shortLivedToken: shortToken.access_token,
    });
    console.log(`[OAuth] long-lived token obtido — expires_in=${longLivedToken.expires_in}`);
  } catch (err: any) {
    console.error(`[OAuth] FALHA ao trocar por long-lived token`, err?.message || err);
    throw err;
  }

  const metaUserId = await getMetaUserId(longLivedToken.access_token);
  console.log(`[OAuth] metaUserId=${metaUserId}`);
  const encryptedToken = encryptToken(longLivedToken.access_token);
  const tokenExpiresAt = getTokenExpiration(longLivedToken.expires_in);

  const existing = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const resolvedReturnUrl = returnUrl ?? RETURN_URLS[context];

  let connectionId: string;

  // Preserva a conta de anúncios selecionada ANTES de limpar adAccounts,
  // para que após o refresh possamos restaurá-la caso ainda exista.
  let oldSelectedAdAccountId: string | null = null;

  if (existing) {
    oldSelectedAdAccountId = existing.selectedAdAccountId;
    await db
      .update(metaConnections)
      .set({
        metaUserId,
        accessToken: encryptedToken,
        tokenExpiresAt,
        adAccounts: [],
        // ponytail: não limpamos selectedAdAccountId aqui — deixamos a lógica
        // após o refresh decidir: mantém a anterior se ainda existir, ou pega a
        // primeira disponível. Assim o usuário não precisa re-selecionar a conta
        // toda vez que reconecta o Meta.
        updatedAt: new Date(),
      })
      .where(eq(metaConnections.id, existing.id));
    connectionId = existing.id;
  } else {
    const [inserted] = await db
      .insert(metaConnections)
      .values({
        tenantId,
        metaUserId,
        accessToken: encryptedToken,
        tokenExpiresAt,
        adAccounts: [],
      })
      .returning({ id: metaConnections.id });
    connectionId = inserted.id;
  }

  console.log(`[OAuth] conexão salva, id=${connectionId}`);

  try {
    const { accounts: adAccounts, ignoredBusinessIds } = await getUserAdAccounts(
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

      await db
        .update(metaConnections)
        .set({ adAccounts, selectedAdAccountId, updatedAt: new Date() })
        .where(eq(metaConnections.id, connectionId));
      await addSyncJob({ tenantId, metaUserId, adAccounts });
    }
  } catch (error) {
    console.error('[OAuth] busca de ativos falhou completamente:', error);
  }

  return { tenantId, context, returnUrl: resolvedReturnUrl };
}

/** Recupera o access token descriptografado da conexao Meta mais recente do tenant. */
async function getTenantAccessToken(tenantId: string): Promise<string> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!connection) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  return decryptToken(connection.accessToken);
}

export interface TenantAssetSelection {
  businessIds: string[];
  pageIds: string[];
  adAccountIds: string[];
  whatsappNumberIds: string[];
}

/** Retorna a selecao de ativos persistida do tenant, ou null se ainda nao houver conexao. */
export async function getTenantAssetSelection(tenantId: string): Promise<TenantAssetSelection | null> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!connection) return null;

  return {
    businessIds: (connection.selectedBusinessIds as string[] | null) ?? [],
    pageIds: (connection.selectedPageIds as string[] | null) ?? [],
    adAccountIds: (connection.selectedAdAccountIds as string[] | null) ?? [],
    whatsappNumberIds: (connection.selectedWhatsappNumberIds as string[] | null) ?? [],
  };
}

/** Persiste a selecao cascateada de ativos (BMs, Paginas, Contas de Anuncio, numeros WhatsApp) do tenant. */
export async function saveTenantAssetSelection(
  tenantId: string,
  selection: TenantAssetSelection,
): Promise<void> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

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

  await db
    .update(metaConnections)
    .set({
      selectedBusinessIds: selection.businessIds,
      selectedPageIds: selection.pageIds,
      selectedAdAccountIds: selection.adAccountIds,
      selectedWhatsappNumberIds: selection.whatsappNumberIds,
      selectedAdAccountId,
      updatedAt: new Date(),
    })
    .where(eq(metaConnections.id, connection.id));
}

/** Lista as Business Managers do tenant (/me/businesses). */
export async function getTenantBusinesses(tenantId: string): Promise<MetaBusiness[]> {
  const accessToken = await getTenantAccessToken(tenantId);
  return getUserBusinesses(accessToken);
}

/** Lista as Paginas pertencentes as Business Managers informadas (uniao, sem duplicatas). */
export async function getTenantPagesByBusiness(tenantId: string, businessIds: string[]): Promise<MetaOwnedPage[]> {
  const accessToken = await getTenantAccessToken(tenantId);

  const pagesByBusiness = await Promise.all(
    businessIds.map((businessId) => getBusinessOwnedPages(businessId, accessToken))
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

export interface TenantBusinessAdAccount {
  adAccountId: string;
  name: string;
  status: number;
  businessId: string;
}

/** Lista as Contas de Anuncio pertencentes as Business Managers informadas (uniao, sem duplicatas). */
export async function getTenantAdAccountsByBusiness(
  tenantId: string,
  businessIds: string[],
): Promise<TenantBusinessAdAccount[]> {
  const accessToken = await getTenantAccessToken(tenantId);

  const accountsByBusiness = await Promise.all(
    businessIds.map(async (businessId) => {
      const accounts = await getBusinessAdAccounts(businessId, accessToken);
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

export interface TenantWhatsappNumber {
  phoneNumberId: string;
  displayPhoneNumber: string;
  businessId?: string;
  pageId?: string;
}

/** Lista numeros WhatsApp das BMs e/ou Paginas selecionadas (uniao, sem duplicatas). */
export async function getTenantWhatsappNumbers(
  tenantId: string,
  { businessIds, pageIds }: { businessIds: string[]; pageIds: string[] },
): Promise<TenantWhatsappNumber[]> {
  const accessToken = await getTenantAccessToken(tenantId);
  const numbers = await getWhatsappNumbersForAssets(accessToken, { businessIds, pageIds });

  return numbers.map(({ phoneNumberId, displayPhoneNumber, businessId, pageId }) => ({
    phoneNumberId,
    displayPhoneNumber,
    businessId,
    pageId,
  }));
}

/** @deprecated Use getTenantWhatsappNumbers — mantido para compatibilidade. */
export async function getTenantWhatsappByPages(tenantId: string, pageIds: string[]): Promise<TenantWhatsappNumber[]> {
  return getTenantWhatsappNumbers(tenantId, { businessIds: [], pageIds });
}

/** Retorna os escopos OAuth concedidos pela conexao Meta mais recente do tenant. */
export async function getTenantMetaScopes(tenantId: string): Promise<string[]> {
  const accessToken = await getTenantAccessToken(tenantId);
  return getUserPermissions(accessToken);
}

/**
 * Lista as Paginas do Facebook vinculadas a conexao Meta do tenant. Se o tenant
 * ja tiver uma selecao de Paginas persistida (fluxo de selecao de ativos), o
 * resultado e filtrado para conter apenas as Paginas selecionadas.
 */
export async function getTenantFacebookPages(tenantId: string): Promise<MetaFacebookPage[]> {
  const accessToken = await getTenantAccessToken(tenantId);
  const pages = await getUserFacebookPages(accessToken, { includeWhatsApp: true });

  const selection = await getTenantAssetSelection(tenantId);
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
export async function getTenantPageWhatsappNumbers(
  tenantId: string,
  pageId: string,
): Promise<MetaWhatsappNumber[]> {
  const accessToken = await getTenantAccessToken(tenantId);
  const numbers = await getPageWhatsappNumbers(pageId, accessToken);

  const selection = await getTenantAssetSelection(tenantId);
  if (selection && selection.whatsappNumberIds.length > 0) {
    return numbers.filter((number) => selection.whatsappNumberIds.includes(number.phoneNumberId));
  }

  return numbers;
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

/**
 * Resolve a selecao de ativos persistida do tenant (BMs, Paginas, Contas de
 * Anuncio e numeros WhatsApp) em detalhes atualizados via Graph API, para uso
 * no Wizard de Campanha (que nao deve pedir nova selecao ao usuario).
 */
export async function getResolvedTenantAssetSelection(tenantId: string): Promise<ResolvedTenantAssetSelection> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!connection) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const accessToken = decryptToken(connection.accessToken);
  const selectedPageIds = (connection.selectedPageIds as string[] | null) ?? [];
  const selectedAdAccountIds = (connection.selectedAdAccountIds as string[] | null) ?? [];
  const selectedWhatsappNumberIds = (connection.selectedWhatsappNumberIds as string[] | null) ?? [];
  const selectedBusinessIds = (connection.selectedBusinessIds as string[] | null) ?? [];

  const [allPages, allBusinesses] = await Promise.all([
    getUserFacebookPages(accessToken, { includeWhatsApp: true }),
    selectedBusinessIds.length > 0 ? getUserBusinesses(accessToken) : Promise.resolve([]),
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
    const numbers = await getWhatsappNumbersForAssets(accessToken, {
      businessIds: selectedBusinessIds,
      pageIds: whatsappPageIds,
    });
    whatsappNumbers = numbers
      .filter((number) => selectedWhatsappNumberIds.includes(number.phoneNumberId))
      .map((number) => ({ phoneNumberId: number.phoneNumberId, displayPhoneNumber: number.displayPhoneNumber }));
  }

  return { pages, adAccounts, whatsappNumbers, businesses };
}

export async function getTenantMetaConnections(tenantId: string): Promise<StoredMetaConnection[]> {
  // Assim como handleMetaOAuthCallback, createCampaignFromWizard e
  // getResolvedTenantAssetSelection, tratamos apenas a conexao mais recente do
  // tenant como canonica. Um findMany aqui retornaria tambem linhas antigas/
  // obsoletas (ex.: de reconexoes anteriores), cujo tokenExpiresAt pode estar
  // vencido, fazendo a UI exibir um card "Pausado" permanente que nao reflete
  // a conexao realmente em uso.
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

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

export async function deleteTenantMetaConnection(tenantId: string, connectionId: string): Promise<void> {
  const existing = await db.query.metaConnections.findFirst({
    where: and(eq(metaConnections.id, connectionId), eq(metaConnections.tenantId, tenantId)),
  });

  if (!existing) {
    throw new AppError(404, 'META_CONNECTION_NOT_FOUND', 'Conexao Meta nao encontrada para este tenant.');
  }

  await db.delete(metaConnections).where(eq(metaConnections.id, connectionId));
}

export async function selectAdAccount(
  tenantId: string,
  connectionId: string,
  adAccountId: string,
): Promise<string> {
  const connection = await db.query.metaConnections.findFirst({
    where: and(eq(metaConnections.id, connectionId), eq(metaConnections.tenantId, tenantId)),
  });

  if (!connection) {
    throw new AppError(404, 'META_CONNECTION_NOT_FOUND', 'Conexao Meta nao encontrada para este tenant.');
  }

  const adAccounts = (connection.adAccounts as MetaAdAccount[]) ?? [];
  const exists = adAccounts.some((a) => a.id === adAccountId);
  if (!exists) {
    throw new AppError(400, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncios nao pertence a esta conexao.');
  }

  await db
    .update(metaConnections)
    .set({ selectedAdAccountId: adAccountId })
    .where(eq(metaConnections.id, connectionId));

  return adAccountId;
}
