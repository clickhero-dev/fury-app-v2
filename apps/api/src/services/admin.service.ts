import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, users } from '@fury/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';
import type { UserDTO } from '../lib/shared.js';

const DEFAULT_NOTIFICATION_PREFS = { campanhas: true, performance: true, equipe: false };

function userToDTO(user: any): UserDTO {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    notificationPrefs: (user.notificationPrefs as UserDTO['notificationPrefs']) ?? DEFAULT_NOTIFICATION_PREFS,
    createdAt: user.createdAt,
  };
}

function generateTemporaryPassword(): string {
  return crypto.randomBytes(6).toString('hex').substring(0, 12);
}

export async function listUsersByTenant(tenantId: string): Promise<UserDTO[]> {
  const userList = await db.query.users.findMany({
    where: eq(users.tenantId, tenantId),
  });

  return userList.map(userToDTO);
}

export async function createUser(
  tenantId: string,
  data: { name: string; email: string; role: 'owner' | 'admin' | 'member' },
): Promise<{ user: UserDTO; temporaryPassword: string }> {
  // Check if email already exists in this tenant
  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.email, data.email), eq(users.tenantId, tenantId)),
  });

  if (existingUser) {
    throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered in this tenant');
  }

  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  // Create user
  const [user] = await db
    .insert(users)
    .values({
      tenantId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
      isSuperadmin: false,
    })
    .returning();

  // TODO: integrar A2 — enviar email de boas-vindas com temporaryPassword
  // await sendWelcomeEmail(user.email, user.name, temporaryPassword);

  return {
    user: userToDTO(user),
    temporaryPassword,
  };
}

export async function resetPassword(userId: string): Promise<{ newPassword: string }> {
  // Fetch user
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  // Superadmin cannot have password reset via this endpoint
  if (user.isSuperadmin) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot reset superadmin password');
  }

  // Generate new temporary password
  const newPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update user password
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  // TODO: integrar A2 — enviar email com newPassword
  // await sendPasswordResetEmail(user.email, user.name, newPassword);

  return {
    newPassword,
  };
}
