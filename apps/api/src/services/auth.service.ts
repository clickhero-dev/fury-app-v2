import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../lib/db.js';
import { tenants, users } from '../lib/db.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertEmailRateLimit, checkEmailRateLimit } from '../lib/email-rate-limit.js';
import {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendWelcomeEmail,
} from './email.service.js';
import type { UserDTO } from '../lib/shared.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_EMAIL_RATE_LIMIT = 5;
const FORGOT_PASSWORD_RATE_LIMIT = 3;

const GENERIC_RESET_MESSAGE =
  'If an account exists with this email, you will receive password reset instructions shortly.';

function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

const DEFAULT_NOTIFICATION_PREFS = { campanhas: true, performance: true, equipe: false };

function userToDTO(user: {
  id: string;
  tenantId: string;
  name: string | null;
  email: string;
  role: UserDTO['role'];
  notificationPrefs: unknown;
  emailVerified: boolean;
  createdAt: Date;
}): UserDTO {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    emailVerified: user.emailVerified,
    notificationPrefs: (user.notificationPrefs as UserDTO['notificationPrefs']) ?? DEFAULT_NOTIFICATION_PREFS,
    createdAt: user.createdAt,
  };
}

function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getResetUrl(token: string, email: string): string {
  const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
  const params = new URLSearchParams({ token, email });
  return `${baseUrl}/reset-password?${params.toString()}`;
}

async function storeRefreshTokenHash(userId: string, refreshToken: string): Promise<void> {
  const redis = getRedis();
  const hash = await bcrypt.hash(refreshToken, 12);
  const key = `refresh:${userId}`;

  await redis.setex(key, REFRESH_TOKEN_TTL, hash);
}

async function verifyRefreshTokenHash(userId: string, refreshToken: string): Promise<boolean> {
  const redis = getRedis();
  const key = `refresh:${userId}`;

  const hash = await redis.get(key);
  if (!hash) {
    return false;
  }

  return bcrypt.compare(refreshToken, hash);
}

async function revokeRefreshToken(userId: string): Promise<void> {
  const redis = getRedis();
  const key = `refresh:${userId}`;
  await redis.del(key);
}

async function issueTokens(user: {
  id: string;
  tenantId: string;
  email: string;
  role: UserDTO['role'];
}): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken(user.id);
  await storeRefreshTokenHash(user.id, refreshToken);

  return { accessToken, refreshToken };
}

async function assignEmailOtp(userId: string): Promise<string> {
  const otp = generateOtp();
  const emailOtpHash = await bcrypt.hash(otp, 12);
  const emailOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);

  await db
    .update(users)
    .set({
      emailOtpHash,
      emailOtpExpiresAt,
      emailVerified: false,
      emailVerifiedAt: null,
    })
    .where(eq(users.id, userId));

  return otp;
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string } }> {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (existingUser) {
    throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');
  }

  const baseSlug = generateSlug(data.companyName);
  const slug = await ensureUniqueSlug(baseSlug);
  const passwordHash = await bcrypt.hash(data.password, 12);

  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: data.companyName,
        slug,
      })
      .returning();

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        name: data.name,
        email: data.email,
        passwordHash,
        role: 'owner',
        emailVerified: false,
      })
      .returning();

    return { tenant, user };
  });

  const otp = await assignEmailOtp(result.user.id);

  await Promise.all([
    sendWelcomeEmail(result.user.email, result.user.name ?? data.name),
    sendOtpEmail(result.user.email, result.user.name ?? data.name, otp),
  ]);

  const tokens = await issueTokens(result.user);

  return {
    user: userToDTO(result.user),
    tokens,
  };
}

export async function login(data: {
  email: string;
  password: string;
}): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string } }> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (!user.emailVerified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email not verified. Please check your inbox for the verification code.');
  }

  const tokens = await issueTokens(user);

  return {
    user: userToDTO(user),
    tokens,
  };
}

export async function verifyEmail(data: { email: string; otp: string }): Promise<{ message: string }> {
  await assertEmailRateLimit('verify_email', data.email, VERIFY_EMAIL_RATE_LIMIT);

  const user = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (!user) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }

  if (user.emailVerified) {
    return { message: 'Email already verified' };
  }

  if (!user.emailOtpHash || !user.emailOtpExpiresAt) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }

  if (user.emailOtpExpiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'OTP_EXPIRED', 'Verification code has expired. Please request a new one.');
  }

  const isValidOtp = await bcrypt.compare(data.otp, user.emailOtpHash);
  if (!isValidOtp) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      emailVerifiedAt: new Date(),
      emailOtpHash: null,
      emailOtpExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  return { message: 'Email verified successfully' };
}

export async function forgotPassword(data: { email: string }): Promise<{ message: string }> {
  const allowed = await checkEmailRateLimit('forgot_password', data.email, FORGOT_PASSWORD_RATE_LIMIT);

  const user = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (user && allowed) {
    const resetToken = generateResetToken();
    const passwordResetTokenHash = await bcrypt.hash(resetToken, 12);
    const passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await db
      .update(users)
      .set({
        passwordResetTokenHash,
        passwordResetExpiresAt,
      })
      .where(eq(users.id, user.id));

    await sendPasswordResetEmail(user.email, user.name ?? '', getResetUrl(resetToken, user.email));
  }

  return { message: GENERIC_RESET_MESSAGE };
}

export async function resetPassword(data: {
  email: string;
  token: string;
  password: string;
}): Promise<{ message: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired reset token');
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'RESET_TOKEN_EXPIRED', 'Reset token has expired. Please request a new one.');
  }

  const isValidToken = await bcrypt.compare(data.token, user.passwordResetTokenHash);
  if (!isValidToken) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  await db
    .update(users)
    .set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  await revokeRefreshToken(user.id);
  await sendPasswordResetSuccessEmail(user.email, user.name ?? '');

  return { message: 'Password reset successfully' };
}

export async function refresh(data: {
  refreshToken: string;
}): Promise<{ tokens: { accessToken: string; refreshToken: string } }> {
  const payload = verifyRefreshToken(data.refreshToken);

  const isValid = await verifyRefreshTokenHash(payload.userId, data.refreshToken);

  if (!isValid) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
  }

  await revokeRefreshToken(user.id);
  const tokens = await issueTokens(user);

  return { tokens };
}

export async function logout(userId: string): Promise<void> {
  await revokeRefreshToken(userId);
}

export async function getMe(userId: string): Promise<UserDTO & { tenantName: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });

  return { ...userToDTO(user), tenantName: tenant?.name ?? '' };
}

export async function updateMe(
  userId: string,
  data: { name?: string; tenantName?: string; notificationPrefs?: UserDTO['notificationPrefs'] },
): Promise<UserDTO & { tenantName: string }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
  }

  const userUpdates: Record<string, unknown> = {};
  if (data.name !== undefined) userUpdates.name = data.name;
  if (data.notificationPrefs !== undefined) userUpdates.notificationPrefs = data.notificationPrefs;

  if (Object.keys(userUpdates).length > 0) {
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  if (data.tenantName !== undefined) {
    await db.update(tenants).set({ name: data.tenantName }).where(eq(tenants.id, user.tenantId));
  }

  return getMe(userId);
}
