import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db, metaConnections } from '../lib/db.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getMetaUserId,
  getUserAdAccounts,
  getUserPermissions,
  type MetaAdAccount,
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
  // 3) Instagram (depende das Paginas)
  'instagram_basic',
  'instagram_manage_insights',
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
    'https://fury-app-v2-production.up.railway.app/api/meta/auth/callback';
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
  const appId = getRequiredEnv('META_APP_ID');
  const appSecret = getRequiredEnv('META_APP_SECRET');
  const redirectUri =
    process.env.META_REDIRECT_URI ??
    'https://fury-app-v2-production.up.railway.app/api/meta/auth/callback';
  const shortToken = await exchangeCodeForToken({
    clientId: appId,
    clientSecret: appSecret,
    redirectUri,
    code,
  });

  const longLivedToken = await exchangeForLongLivedToken({
    clientId: appId,
    clientSecret: appSecret,
    shortLivedToken: shortToken.access_token,
  });

  const metaUserId = await getMetaUserId(longLivedToken.access_token);
  const adAccounts = await getUserAdAccounts(longLivedToken.access_token);
  const encryptedToken = encryptToken(longLivedToken.access_token);
  const tokenExpiresAt = getTokenExpiration(longLivedToken.expires_in);

  const existing = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const resolvedReturnUrl = returnUrl ?? RETURN_URLS[context];

  if (existing) {
    await db
      .update(metaConnections)
      .set({
        metaUserId,
        accessToken: encryptedToken,
        tokenExpiresAt,
        adAccounts,
        selectedAdAccountId: null,
        updatedAt: new Date(),
      })
      .where(eq(metaConnections.id, existing.id));
    await addSyncJob({ tenantId, metaUserId, adAccounts });
    return { tenantId, context, returnUrl: resolvedReturnUrl };
  }

  await db.insert(metaConnections).values({
    tenantId,
    metaUserId,
    accessToken: encryptedToken,
    tokenExpiresAt,
    adAccounts,
  });

  await addSyncJob({ tenantId, metaUserId, adAccounts });
  return { tenantId, context, returnUrl: resolvedReturnUrl };
}

/** Retorna os escopos OAuth concedidos pela conexao Meta mais recente do tenant. */
export async function getTenantMetaScopes(tenantId: string): Promise<string[]> {
  const connection = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!connection) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const accessToken = decryptToken(connection.accessToken);
  return getUserPermissions(accessToken);
}

export async function getTenantMetaConnections(tenantId: string): Promise<StoredMetaConnection[]> {
  const connections = await db.query.metaConnections.findMany({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return connections.map((connection) => ({
    id: connection.id,
    tenantId: connection.tenantId,
    metaUserId: connection.metaUserId,
    accessToken: maskToken(connection.accessToken),
    tokenExpiresAt: connection.tokenExpiresAt,
    adAccounts: (connection.adAccounts as MetaAdAccount[]) || [],
    selectedAdAccountId: connection.selectedAdAccountId ?? null,
    createdAt: connection.createdAt,
  }));
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
