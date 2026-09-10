import { eq } from 'drizzle-orm';
import { db as dbInstance, tenants, users, type Database } from '../../lib/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { AuthRepository } from '../../repository/auth.repository.js';
import { generateAccessToken, generateRefreshToken } from '../../lib/jwt.js';
import { getGoogleOAuthConfig } from '../../lib/google-oauth.js';
import {
  getFacebookOAuthConfig,
  exchangeCodeForToken as exchangeFacebookCodeForToken,
  fetchFacebookUserInfo,
  FACEBOOK_OAUTH_DIALOG_URL,
} from '../../lib/facebook-oauth.js';
import type { UserDTO } from '../../lib/shared.js';
import crypto from 'node:crypto';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SOCIAL_LOGIN_SCOPE = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const FACEBOOK_LOGIN_SCOPE = 'public_profile,email';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
const SOCIAL_HANDOFF_TTL = 60;
const DEFAULT_NOTIFICATION_PREFS = { campanhas: true, performance: true, equipe: false };

function userToDTO(user: any): UserDTO {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    notificationPrefs: (user.notificationPrefs as UserDTO['notificationPrefs']) ?? DEFAULT_NOTIFICATION_PREFS,
    audienceDefaults: user.audienceDefaults as UserDTO['audienceDefaults'],
    createdAt: user.createdAt,
  };
}

function generateSlug(companyName: string): string {
  return companyName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function generateCodigo(companyName: string, tenantId: string): string {
  const slug = generateSlug(companyName);
  const prefix = slug.slice(0, 3).toUpperCase().padEnd(3, 'X');
  const hash = crypto.createHash('md5').update(tenantId).digest('hex');
  const digits = String(parseInt(hash.slice(0, 8), 16) % 100000).padStart(5, '0');
  return `${prefix}${digits}`;
}

async function storeRefreshTokenHash(userId: string, refreshToken: string): Promise<void> {
  const { getRedis } = await import('../../lib/redis.js');
  const redis = getRedis();
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await redis.setex(`refresh:${userId}`, REFRESH_TOKEN_TTL, hash);
}

async function revokeRefreshToken(userId: string): Promise<void> {
  const { getRedis } = await import('../../lib/redis.js');
  await getRedis().del(`refresh:${userId}`);
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

/**
 * SocialAuthService — classe pura de domínio com DI no construtor (repoFactory + jwt/googleOAuth).
 */
export class SocialAuthService {
  constructor(
    private readonly repoFactory: (tenantId: string) => AuthRepository = (t) => new AuthRepository(t),
    private readonly deps: {
      jwt: { generateAccessToken: typeof generateAccessToken; generateRefreshToken: typeof generateRefreshToken };
      googleOauth: { getGoogleOAuthConfig: typeof getGoogleOAuthConfig };
      facebookOauth: {
        getFacebookOAuthConfig: typeof getFacebookOAuthConfig;
        exchangeCodeForToken: typeof exchangeFacebookCodeForToken;
        fetchFacebookUserInfo: typeof fetchFacebookUserInfo;
      };
    } = {
      jwt: { generateAccessToken, generateRefreshToken },
      googleOauth: { getGoogleOAuthConfig },
      facebookOauth: {
        getFacebookOAuthConfig,
        exchangeCodeForToken: exchangeFacebookCodeForToken,
        fetchFacebookUserInfo,
      },
    },
  ) {}

  private repo(t: string): AuthRepository {
    return this.repoFactory(t);
  }

  /** Gera URL de OAuth social Google (apenas userinfo, sem business.manage). */
  generateSocialLoginUrl(redirectUri: string, clientId: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SOCIAL_LOGIN_SCOPE,
      access_type: 'online',
    });
    if (state) params.set('state', state);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Gera URL de OAuth do Facebook para login social (escopo public_profile + email). */
  generateFacebookLoginUrl(redirectUri: string, state?: string): string {
    const { appId } = this.deps.facebookOauth.getFacebookOAuthConfig();
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: FACEBOOK_LOGIN_SCOPE,
    });
    if (state) params.set('state', state);
    return `${FACEBOOK_OAUTH_DIALOG_URL}?${params.toString()}`;
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await this.repo('').findTenantBySlug(slug);
      if (!existing) return slug;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  private async fetchGoogleUserInfo(code: string, redirectUri: string): Promise<GoogleUserInfo> {
    const { clientId, clientSecret } = this.deps.googleOauth.getGoogleOAuthConfig();

    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) throw new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Falha ao obter token do Google.');

    const tokenData = (await tokenRes.json()) as { access_token: string };
    if (!tokenData.access_token) throw new AppError(502, 'GOOGLE_TOKEN_EXCHANGE_FAILED', 'Token ausente.');

    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!userInfoRes.ok) throw new AppError(502, 'GOOGLE_USERINFO_FAILED', 'Falha ao obter dados do usuario.');

    return userInfoRes.json() as Promise<GoogleUserInfo>;
  }

  /**
   * Login/Cadastro social com Google (via AuthRepository scoped + deps jwt).
   */
  async handleGoogleSocialLogin(
    code: string,
    redirectUri: string,
    database: Database = dbInstance,
  ): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string }; isNewUser: boolean }> {
    const userInfo = await this.fetchGoogleUserInfo(code, redirectUri);
    const googleId = userInfo.sub;
    const email = userInfo.email;
    const name = userInfo.name || null;

    let user = await this.repo('').findUserByGoogleId(googleId);
    if (user) {
      const accessToken = this.deps.jwt.generateAccessToken({ userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role });
      const refreshToken = this.deps.jwt.generateRefreshToken(user.id);
      await revokeRefreshToken(user.id);
      await storeRefreshTokenHash(user.id, refreshToken);
      return { user: userToDTO(user), tokens: { accessToken, refreshToken }, isNewUser: false };
    }

    user = await this.repo('').findUserByEmail(email);
    if (user) {
      // Paridade com o Facebook: conta de STAFF da plataforma nunca é
      // auto-vinculada por match de e-mail de provedor social.
      if (user.role === 'superadmin' || user.role === 'admin') {
        throw new AppError(
          409,
          'ACCOUNT_LINK_NOT_ALLOWED',
          'Nao e possivel vincular o Google a esta conta. Entre com e-mail e senha.',
        );
      }
      await this.repo('').patchUser(user.id, { googleId, emailVerified: true });
      const accessToken = this.deps.jwt.generateAccessToken({ userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role });
      const refreshToken = this.deps.jwt.generateRefreshToken(user.id);
      await storeRefreshTokenHash(user.id, refreshToken);
      return { user: userToDTO(user), tokens: { accessToken, refreshToken }, isNewUser: false };
    }

    const tenantName = name || email.split('@')[0];
    const baseSlug = generateSlug(tenantName);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const result = await database.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({ name: tenantName, slug }).returning();
      const codigo = generateCodigo(tenantName, tenant.id);
      await tx.update(tenants).set({ codigo }).where(eq(tenants.id, tenant.id));
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email,
          passwordHash: null,
          googleId,
          role: 'owner',
          emailVerified: userInfo.email_verified,
          name,
        })
        .returning();
      return { user: newUser };
    });

    const accessToken = this.deps.jwt.generateAccessToken({ userId: result.user.id, tenantId: result.user.tenantId, email: result.user.email, role: result.user.role });
    const refreshToken = this.deps.jwt.generateRefreshToken(result.user.id);
    await storeRefreshTokenHash(result.user.id, refreshToken);

    return { user: userToDTO(result.user), tokens: { accessToken, refreshToken }, isNewUser: true };
  }

  /**
   * Login/Cadastro social com Facebook (escopo public_profile + email).
   *
   * Ordem: (1) já vinculado por `facebookId` → loga; (2) mesma pessoa por e-mail
   * (conta Google ou senha) → vincula `facebookId` e loga; (3) novo → cria
   * tenant + user (`role: owner`, sem senha).
   *
   * O Graph só devolve `email` para contas com e-mail confirmado, então a
   * presença do e-mail funciona como prova de verificação para o vínculo (2).
   * Sem e-mail → recusa (o cadastro precisa de e-mail).
   */
  async handleFacebookSocialLogin(
    code: string,
    redirectUri: string,
    database: Database = dbInstance,
  ): Promise<{ user: UserDTO; isNewUser: boolean }> {
    const token = await this.deps.facebookOauth.exchangeCodeForToken({ code, redirectUri });
    const info = await this.deps.facebookOauth.fetchFacebookUserInfo(token.access_token);

    const facebookId = info.id;
    const email = info.email?.trim().toLowerCase();
    const name = info.name || null;

    if (!email) {
      throw new AppError(
        400,
        'FACEBOOK_EMAIL_MISSING',
        'Sua conta do Facebook nao tem um e-mail disponivel. Cadastre-se com e-mail e senha.',
      );
    }

    // 1) já vinculado por facebookId
    let user = await this.repo('').findUserByFacebookId(facebookId);
    if (user) {
      return { user: userToDTO(user), isNewUser: false };
    }

    // 2) mesma pessoa por e-mail (conta Google ou provedor próprio) → vincula.
    //
    // RISCO CONHECIDO / ACEITO NO MVP: o Facebook NÃO garante que o e-mail do
    // /me é verificado. Isto permite, em tese, um account takeover de conta
    // `owner`/`member` por quem controla um FB com o mesmo e-mail. Decisão de
    // produto: manter, porque o objetivo é "entrar pela conta por mais de um
    // provedor". A escalar ao time; fix próprio = verificação de posse (OTP no
    // e-mail ou login prévio) antes de anexar o facebookId.
    // Mitigação aplicada: contas de STAFF da plataforma (superadmin/admin)
    // nunca são auto-vinculadas.
    user = await this.repo('').findUserByEmail(email);
    if (user) {
      if (user.role === 'superadmin' || user.role === 'admin') {
        throw new AppError(
          409,
          'ACCOUNT_LINK_NOT_ALLOWED',
          'Nao e possivel vincular o Facebook a esta conta. Entre com e-mail e senha.',
        );
      }
      await this.repo('').patchUser(user.id, { facebookId, emailVerified: true });
      return { user: userToDTO(user), isNewUser: false };
    }

    // 3) novo usuário → cria tenant + user
    const tenantName = name || email.split('@')[0];
    const baseSlug = generateSlug(tenantName);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const result = await database.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({ name: tenantName, slug }).returning();
      const codigo = generateCodigo(tenantName, tenant.id);
      await tx.update(tenants).set({ codigo }).where(eq(tenants.id, tenant.id));
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email,
          passwordHash: null,
          facebookId,
          role: 'owner',
          emailVerified: true,
          name,
        })
        .returning();
      return { user: newUser };
    });

    return { user: userToDTO(result.user), isNewUser: true };
  }

  /** Emite par de tokens e rotaciona o refresh hash no Redis (revoga o anterior). */
  async issueSession(user: { id: string; tenantId: string; email: string; role: string }) {
    const accessToken = this.deps.jwt.generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
    const refreshToken = this.deps.jwt.generateRefreshToken(user.id);
    await revokeRefreshToken(user.id);
    await storeRefreshTokenHash(user.id, refreshToken);
    return { accessToken, refreshToken };
  }

  /**
   * Guarda um payload leve (identidade, SEM tokens) sob um id opaco de uso único
   * no Redis. O redirect pós-OAuth carrega só esse id; a sessão é emitida na
   * troca (`consumeSocialHandoff` + `issueSession`).
   */
  async createSocialHandoff(payload: unknown): Promise<string> {
    const { getRedis } = await import('../../lib/redis.js');
    const id = crypto.randomBytes(32).toString('hex');
    await getRedis().setex(`social_handoff:${id}`, SOCIAL_HANDOFF_TTL, JSON.stringify(payload));
    return id;
  }

  /** Consome o handoff de forma atômica (GETDEL). Retorna null se ausente/expirado. */
  async consumeSocialHandoff(id: string): Promise<unknown | null> {
    const { getRedis } = await import('../../lib/redis.js');
    const redis = getRedis();
    const key = `social_handoff:${id}`;

    let raw: string | null;
    try {
      raw = (await (redis as unknown as { getdel(k: string): Promise<string | null> }).getdel(key)) ?? null;
    } catch {
      // Redis < 6.2 sem GETDEL — fallback não atômico
      raw = await redis.get(key);
      if (raw !== null) await redis.del(key);
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async socialLogout(userId: string): Promise<void> {
    await revokeRefreshToken(userId);
  }
}

export const socialAuthService = new SocialAuthService();