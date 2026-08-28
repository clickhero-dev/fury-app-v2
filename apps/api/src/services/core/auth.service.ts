import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { db } from '../../lib/db.js';
import { tenants, users } from '../../lib/db.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt.js';
import { sendWelcomeEmail, sendOtpEmail, sendPasswordResetConfirmation } from '../email/email.service.js';
import type { UserDTO } from '../../lib/shared.js';
import { AuthRepository } from '../../repository/auth.repository.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const DEFAULT_NOTIFICATION_PREFS = { campanhas: true, performance: true, equipe: false };

// ── helpers puros (sem dependência de repo) ──────────────────────────
function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateCodigo(companyName: string, tenantId: string): string {
  const slug = generateSlug(companyName);
  const prefix = slug.slice(0, 3).toUpperCase().padEnd(3, 'X');
  const hash = crypto.createHash('md5').update(tenantId).digest('hex');
  const digits = String(parseInt(hash.slice(0, 8), 16) % 100000).padStart(5, '0');
  return `${prefix}${digits}`;
}

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

function generateSecureOtp(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

async function storeRefreshTokenHash(userId: string, refreshToken: string): Promise<void> {
  const redis = getRedis();
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const key = `refresh:${userId}`;
  await redis.setex(key, REFRESH_TOKEN_TTL, hash);
}

async function verifyRefreshTokenHash(userId: string, refreshToken: string): Promise<boolean> {
  const redis = getRedis();
  const key = `refresh:${userId}`;
  const hash = await redis.get(key);
  if (!hash) return false;
  const computedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  if (hash.length !== computedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

async function revokeRefreshToken(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`refresh:${userId}`);
}

/**
 * AuthService — classe pura de domínio com DI no construtor (repoFactory + jwt/email).
 */
export class AuthService {
  constructor(
    private readonly repoFactory: (tenantId: string) => AuthRepository = (t) => new AuthRepository(t),
    private readonly deps: {
      jwt: { generateAccessToken: typeof generateAccessToken; generateRefreshToken: typeof generateRefreshToken; verifyRefreshToken: typeof verifyRefreshToken };
      email: { sendWelcomeEmail: typeof sendWelcomeEmail; sendOtpEmail: typeof sendOtpEmail; sendPasswordResetConfirmation: typeof sendPasswordResetConfirmation };
    } = {
      jwt: { generateAccessToken, generateRefreshToken, verifyRefreshToken },
      email: { sendWelcomeEmail, sendOtpEmail, sendPasswordResetConfirmation },
    },
  ) {}

  private repo(t: string): AuthRepository {
    return this.repoFactory(t);
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

  async register(data: { name: string; email: string; password: string; companyName: string }): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string } }> {
    const existingUser = await this.repo('').findUserByEmail(data.email);
    if (existingUser) throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');

    const baseSlug = generateSlug(data.companyName);
    const slug = await this.ensureUniqueSlug(baseSlug);
    const passwordHash = await bcrypt.hash(data.password, 10);

    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({ name: data.companyName, slug }).returning();
      const codigo = generateCodigo(data.companyName, tenant.id);
      await tx.update(tenants).set({ codigo }).where(eq(tenants.id, tenant.id));
      const [user] = await tx
        .insert(users)
        .values({ tenantId: tenant.id, email: data.email, passwordHash, role: 'owner' })
        .returning();
      return { tenant: { ...tenant, codigo }, user };
    });

    const accessToken = this.deps.jwt.generateAccessToken({
      userId: result.user.id,
      tenantId: result.user.tenantId,
      email: result.user.email,
      role: result.user.role,
    });
    const refreshToken = this.deps.jwt.generateRefreshToken(result.user.id);
    await storeRefreshTokenHash(result.user.id, refreshToken);

    return { user: userToDTO(result.user), tokens: { accessToken, refreshToken } };
  }

  async login(data: { email: string; password: string }): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string } }> {
    const user = await this.repo('').findUserByEmail(data.email);
    if (!user || !user.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const accessToken = this.deps.jwt.generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
    const refreshToken = this.deps.jwt.generateRefreshToken(user.id);
    await storeRefreshTokenHash(user.id, refreshToken);

    return { user: userToDTO(user), tokens: { accessToken, refreshToken } };
  }

  async refresh(data: { refreshToken: string }): Promise<{ tokens: { accessToken: string; refreshToken: string } }> {
    const t0 = Date.now();
    const payload = this.deps.jwt.verifyRefreshToken(data.refreshToken);
    const t1 = Date.now();
    const isValid = await verifyRefreshTokenHash(payload.userId, data.refreshToken);
    const t2 = Date.now();
    if (!isValid) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token');

    const user = await this.repo('').findUserById(payload.userId);
    const t3 = Date.now();
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User not found');

    await revokeRefreshToken(user.id);
    const accessToken = this.deps.jwt.generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
    const refreshToken = this.deps.jwt.generateRefreshToken(user.id);
    await storeRefreshTokenHash(user.id, refreshToken);
    const t4 = Date.now();
    console.log(`[refresh] jwt=${t1 - t0}ms redis.get=${t2 - t1}ms pg.user=${t3 - t2}ms redis.setex=${t4 - t3}ms total=${t4 - t0}ms`);

    return { tokens: { accessToken, refreshToken } };
  }

  async logout(userId: string): Promise<void> {
    await revokeRefreshToken(userId);
  }

  async getMe(userId: string): Promise<UserDTO & { tenantName: string; tenantSlug: string; tenantCodigo: string; businessContext: string | null }> {
    const user = await this.repo('').findUserById(userId);
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
    const tenant = await this.repo(user.tenantId).findTenant();
    return {
      ...userToDTO(user),
      tenantName: tenant?.name ?? '',
      tenantSlug: tenant?.slug ?? '',
      tenantCodigo: tenant?.codigo ?? '',
      businessContext: tenant?.businessContext ?? null,
    };
  }

  async updateMe(
    userId: string,
    data: { name?: string; tenantName?: string; notificationPrefs?: UserDTO['notificationPrefs']; audienceDefaults?: Record<string, unknown>; businessContext?: string },
  ): Promise<UserDTO & { tenantName: string; tenantSlug: string; tenantCodigo: string; businessContext: string | null }> {
    const user = await this.repo('').findUserById(userId);
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User not found');

    const userUpdates: Record<string, unknown> = {};
    if (data.name !== undefined) userUpdates.name = data.name;
    if (data.notificationPrefs !== undefined) userUpdates.notificationPrefs = data.notificationPrefs;
    if (data.audienceDefaults !== undefined) userUpdates.audienceDefaults = data.audienceDefaults;
    if (Object.keys(userUpdates).length > 0) await this.repo('').patchUser(userId, userUpdates);

    if (data.tenantName !== undefined) await this.repo(user.tenantId).patchTenant(user.tenantId, { name: data.tenantName });
    if (data.businessContext !== undefined) await this.repo(user.tenantId).patchTenant(user.tenantId, { businessContext: data.businessContext || null });

    return this.getMe(userId);
  }

  async verifyEmail(email: string, otp: string): Promise<UserDTO> {
    const user = await this.repo('').findUserByEmail(email);
    if (!user) throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');

    const isOtpValid = user.otpCode === otp && user.otpExpiresAt !== null && user.otpExpiresAt > new Date();
    if (!isOtpValid) throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');

    await this.repo('').patchUser(user.id, { emailVerified: true, otpCode: null, otpExpiresAt: null });

    try {
      await this.deps.email.sendWelcomeEmail(user.email, user.name || 'Usuário');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[verifyEmail] Failed to send welcome email to ${user.email}:`, errorMessage);
    }

    const updatedUser = await this.repo('').findUserById(user.id);
    if (!updatedUser) throw new AppError(500, 'USER_NOT_FOUND', 'Usuário não encontrado');
    return userToDTO(updatedUser);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.repo('').findUserByEmail(email);
    if (user) {
      const otp = generateSecureOtp();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await this.repo('').patchUser(user.id, { otpCode: otp, otpExpiresAt });
      this.deps.email.sendOtpEmail(user.email, otp).catch((error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[forgotPassword] Failed to send OTP email to ${user.email}:`, errorMessage);
      });
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<UserDTO> {
    const user = await this.repo('').findUserByEmail(email);
    if (!user) throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');

    const isOtpValid = user.otpCode === otp && user.otpExpiresAt !== null && user.otpExpiresAt > new Date();
    if (!isOtpValid) throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.repo('').patchUser(user.id, { passwordHash, otpCode: null, otpExpiresAt: null, resetToken: null, resetTokenExpiresAt: null });
    await revokeRefreshToken(user.id);

    this.deps.email.sendPasswordResetConfirmation(user.email).catch((error: any) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[resetPassword] Failed to send password reset confirmation to ${user.email}:`, errorMessage);
    });

    const updatedUser = await this.repo('').findUserById(user.id);
    if (!updatedUser) throw new AppError(500, 'USER_NOT_FOUND', 'Usuário não encontrado');
    return userToDTO(updatedUser);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.repo('').findUserById(userId);
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
    if (!user.passwordHash) throw new AppError(400, 'NO_PASSWORD', 'Login feito com Google. Defina uma senha nas configurações.');

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) throw new AppError(400, 'WRONG_PASSWORD', 'Senha atual incorreta');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.repo('').patchUser(userId, { passwordHash });
  }
}

export const authService = new AuthService();