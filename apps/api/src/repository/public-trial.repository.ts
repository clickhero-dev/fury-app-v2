import crypto from 'node:crypto';
import { db as defaultDb, type Database, plans, publicTrialAccessTokens, subscriptions, tenants, users } from '@fury/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

/** Global identity/acquisition repository; no tenant exists before signup. */
export class PublicTrialRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async createOrFindAccount(input: { name: string; email: string; phone?: string }) {
    try {
      return await this.db.transaction(async (tx) => {
      const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (existing) {
        const tenant = await tx.query.tenants.findFirst({ where: eq(tenants.id, existing.tenantId) });
        return { created: false as const, user: existing, isPublicTrial: tenant?.publicTrial === true };
      }
      const plan = await tx.query.plans.findFirst({ where: and(eq(plans.technicalKey, 'public_trial_signup'), eq(plans.isActive, true)) });
      if (!plan) throw new Error('PUBLIC_TRIAL_PLAN_UNAVAILABLE');
      const [tenant] = await tx.insert(tenants).values({ name: input.name, slug: `trial-${crypto.randomUUID()}`, publicTrial: true }).returning();
      const [user] = await tx.insert(users).values({ tenantId: tenant.id, name: input.name, email: input.email, phone: input.phone ?? null, passwordHash: null, role: 'owner', emailVerified: true }).returning();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.insert(subscriptions).values({ tenantId: tenant.id, planId: plan.id, status: 'trial', trialEndsAt: end, currentPeriodEnd: end, creativesRemaining: 7 });
      return { created: true as const, user, isPublicTrial: true as const };
      });
    } catch (error: any) {
      // The normalized unique index can win a race after our initial lookup.
      // Returning the existing identity makes repeated webhook delivery idempotent.
      if (error?.code !== '23505') throw error;
      const user = await this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (!user) throw error;
      const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
      return { created: false as const, user, isPublicTrial: tenant?.publicTrial === true };
    }
  }

  async issueToken(userId: string, tenantId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(publicTrialAccessTokens).set({ revokedAt: new Date() }).where(and(eq(publicTrialAccessTokens.userId, userId), isNull(publicTrialAccessTokens.consumedAt), isNull(publicTrialAccessTokens.revokedAt)));
      await tx.insert(publicTrialAccessTokens).values({ userId, tenantId, tokenHash, expiresAt });
    });
  }

  /** Conditional update makes two simultaneous POSTs yield exactly one session. */
  async consumeToken(tokenHash: string, now: Date) {
    const [token] = await this.db.update(publicTrialAccessTokens).set({ consumedAt: now })
      .where(and(eq(publicTrialAccessTokens.tokenHash, tokenHash), isNull(publicTrialAccessTokens.consumedAt), isNull(publicTrialAccessTokens.revokedAt), gt(publicTrialAccessTokens.expiresAt, now)))
      .returning();
    if (!token) return null;
    const [user, tenant] = await Promise.all([
      this.db.query.users.findFirst({ where: and(eq(users.id, token.userId), isNull(users.deletedAt)) }),
      this.db.query.tenants.findFirst({ where: and(eq(tenants.id, token.tenantId), eq(tenants.publicTrial, true), isNull(tenants.deletedAt)) }),
    ]);
    return user && tenant ? user : null;
  }
}
