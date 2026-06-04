import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { tenants, users } from '../lib/db.js';
import { eq } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
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

function userToDTO(user: any): UserDTO {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    createdAt: user.createdAt,
  };
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
  const passwordHash = await bcrypt.hash(data.password, 12);

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
  const payload = verifyRefreshToken(data.refreshToken);

  // Verify refresh token hash in Redis
  const isValid = await verifyRefreshTokenHash(payload.userId, data.refreshToken);

  if (!isValid) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or revoked refresh token');
  }

  // Get fresh user data
  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

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

  return {
    tokens: { accessToken, refreshToken },
  };
}

export async function logout(userId: string): Promise<void> {
  await revokeRefreshToken(userId);
}

export async function getMe(userId: string): Promise<UserDTO> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User not found');
  }

  return userToDTO(user);
}
