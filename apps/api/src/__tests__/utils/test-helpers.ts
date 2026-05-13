import { generateAccessToken } from '../../lib/jwt.js';
import { db, tenants, users, metaConnections, campaigns, creativeAssets, automationRules } from '@fury/db';
import { eq } from 'drizzle-orm';

export interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  token: string;
}

export async function createTestTenant(slug: string, name: string = slug) {
  const [tenant] = await db.insert(tenants).values({ name, slug }).returning();
  return tenant;
}

export async function createTestUser(
  tenantId: string,
  email: string,
  passwordHash: string = 'hashed_password'
): Promise<TestUser> {
  const [user] = await db
    .insert(users)
    .values({
      tenantId,
      email,
      passwordHash,
      role: 'owner',
    })
    .returning();

  const token = generateAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    token,
  };
}

export async function createTestMetaConnection(
  tenantId: string,
  adAccountIds: string[] = ['act_111111111']
) {
  const [connection] = await db
    .insert(metaConnections)
    .values({
      tenantId,
      metaUserId: 'mock_user_' + Math.random().toString(36).slice(2),
      accessToken: 'mock_access_token_' + Math.random().toString(36).slice(2),
      adAccounts: adAccountIds.map((id) => ({
        id,
        name: `Ad Account ${id}`,
        account_status: 1,
        currency: 'BRL',
      })) as unknown as any,
    })
    .returning();

  return connection;
}

export async function cleanupDatabase() {
  try {
    // Delete in correct order due to foreign keys
    const { furyInsights, clientGoals } = await import('@fury/db');

    await db.delete(furyInsights);
    await db.delete(clientGoals);
    await db.delete(campaigns);
    await db.delete(creativeAssets);
    await db.delete(automationRules);
    await db.delete(metaConnections);
    await db.delete(users);
    await db.delete(tenants);
  } catch (error) {
    console.error('Error cleaning up database:', error);
  }
}

export function getAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
