import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { db } from '../lib/db.js';
import { tenants, users } from '../lib/db.js';
import { eq, and } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendWelcomeEmail, sendOtpEmail } from './email.service.js';
import type { UserDTO } from '../lib/shared.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

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
  if (!hash) {
    return false;
  }

  const computedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  if (hash.length !== computedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

async function revokeRefreshToken(userId: string): Promise<void> {
  const redis = getRedis();
  const key = `refresh:${userId}`;
  await redis.del(key);
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<{ user: UserDTO; tokens: { accessToken: string; refreshToken: string } }> {
  // Check if email already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, data.email),
  });

  if (existingUser) {
    throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');
  }

  // Generate unique slug
  const baseSlug = generateSlug(data.companyName);
  const slug = await ensureUniqueSlug(baseSlug);

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 10);

  // Create tenant and user in transaction
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
        email: data.email,
        passwordHash,
        role: 'owner',
      })
      .returning();

    return { tenant, user };
  });

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: result.user.id,
    tenantId: result.user.tenantId,
    email: result.user.email,
    role: result.user.role,
  });

  const refreshToken = generateRefreshToken(result.user.id);

  // Store refresh token hash
  await storeRefreshTokenHash(result.user.id, refreshToken);

  return {
    user: userToDTO(result.user),
    tokens: { accessToken, refreshToken },
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

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken(user.id);

  // Store refresh token hash
  await storeRefreshTokenHash(user.id, refreshToken);

  return {
    user: userToDTO(user),
    tokens: { accessToken, refreshToken },
  };
}

export async function refresh(data: {
  refreshToken: string;
}): Promise<{ tokens: { accessToken: string; refreshToken: string } }> {
  const t0 = Date.now();
  const payload = verifyRefreshToken(data.refreshToken);
  const t1 = Date.now();

  // Verify refresh token hash in Redis
  const isValid = await verifyRefreshTokenHash(payload.userId, data.refreshToken);
  const t2 = Date.now();

  if (!isValid) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token');
  }

  // Get fresh user data
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });
  const t3 = Date.now();

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
  }

  // Revoke old refresh token
  await revokeRefreshToken(user.id);

  // Generate new tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  const refreshToken = generateRefreshToken(user.id);

  // Store new refresh token hash
  await storeRefreshTokenHash(user.id, refreshToken);
  const t4 = Date.now();

  console.log(`[refresh] jwt=${t1-t0}ms redis.get=${t2-t1}ms pg.user=${t3-t2}ms redis.setex=${t4-t3}ms total=${t4-t0}ms`);

  return {
    tokens: { accessToken, refreshToken },
  };
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
  data: { name?: string; tenantName?: string; notificationPrefs?: UserDTO['notificationPrefs']; audienceDefaults?: Record<string, unknown> },
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
  if (data.audienceDefaults !== undefined) userUpdates.audienceDefaults = data.audienceDefaults;

  if (Object.keys(userUpdates).length > 0) {
    await db.update(users).set(userUpdates).where(eq(users.id, userId));
  }

  if (data.tenantName !== undefined) {
    await db.update(tenants).set({ name: data.tenantName }).where(eq(tenants.id, user.tenantId));
  }

  return getMe(userId);
}

export async function verifyEmail(email: string, otp: string): Promise<UserDTO> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');
  }

  const now = new Date();
  const isOtpValid =
    user.otpCode === otp &&
    user.otpExpiresAt !== null &&
    user.otpExpiresAt > now;

  if (!isOtpValid) {
    throw new AppError(400, 'INVALID_OR_EXPIRED_OTP', 'Código inválido ou expirado');
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      otpCode: null,
      otpExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  try {
    await sendWelcomeEmail(user.email, user.name || 'Usuário');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[verifyEmail] Failed to send welcome email to ${user.email}:`, errorMessage);
  }

  const updatedUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
  });

  if (!updatedUser) {
    throw new AppError(500, 'USER_NOT_FOUND', 'Usuário não encontrado');
  }

  return userToDTO(updatedUser);
}

function generateSecureOtp(): string {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user) {
    const otp = generateSecureOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db
      .update(users)
      .set({
        otpCode: otp,
        otpExpiresAt,
      })
      .where(eq(users.id, user.id));

    sendOtpEmail(user.email, otp).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[forgotPassword] Failed to send OTP email to ${user.email}:`, errorMessage);
    });
  }
}
