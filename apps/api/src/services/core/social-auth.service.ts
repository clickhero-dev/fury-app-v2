import { eq } from 'drizzle-orm';
import { db as dbInstance, tenants, users, type Database } from '../../lib/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { AuthRepository } from '../../repository/auth.repository.js';
import { generateAccessToken, generateRefreshToken } from '../../lib/jwt.js';
import { getGoogleOAuthConfig } from '../../lib/google-oauth.js';
import type { UserDTO } from '../../lib/shared.js';
import crypto from 'node:crypto';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SOCIAL_LOGIN_SCOPE = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
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
    } = {
      jwt: { generateAccessToken, generateRefreshToken },
      googleOauth: { getGoogleOAuthConfig },
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

  async socialLogout(userId: string): Promise<void> {
    await revokeRefreshToken(userId);
  }
}

export const socialAuthService = new SocialAuthService();