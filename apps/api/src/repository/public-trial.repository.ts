import crypto from 'node:crypto';
import { db as defaultDb, type Database, plans, publicTrialAccounts, publicTrialMagicLinks, subscriptions, tenants, users } from '@fury/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { provisionTrialSubscription } from '../services/billing/trial-signup.js';

/** Global identity/acquisition repository; no tenant exists before signup. */
export class PublicTrialRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async createOrFindAccount(input: { name: string; email: string; phone?: string }) {
    try {
      return await this.db.transaction(async (tx) => {
      const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (existing) {
        const account = await tx.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, existing.id) });
        return { created: false as const, accountId: account?.id ?? null, user: existing, isPublicTrial: !!account };
      }
      const [tenant] = await tx.insert(tenants).values({ name: input.name, slug: `trial-${crypto.randomUUID()}` }).returning();
      const [user] = await tx.insert(users).values({ tenantId: tenant.id, name: input.name, email: input.email, passwordHash: null, role: 'owner', emailVerified: true }).returning();
      await provisionTrialSubscription({
        queryPlan: async (technicalKey) => (await tx.query.plans.findFirst({ where: and(eq(plans.technicalKey, technicalKey), eq(plans.isActive, true)) })) ?? null,
        querySubscription: async (tenantId) => (await tx.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) })) ?? null,
        insertSubscription: async (values) => {
          const [subscription] = await tx.insert(subscriptions).values(values as any).returning({ id: subscriptions.id });
          return subscription;
        },
      }, tenant.id, new Date());
      const [account] = await tx.insert(publicTrialAccounts).values({ tenantId: tenant.id, userId: user.id, phone: input.phone ?? null }).returning({ id: publicTrialAccounts.id });
      return { created: true as const, accountId: account.id, user, isPublicTrial: true as const };
      });
    } catch (error: any) {
      // The normalized unique index can win a race after our initial lookup.
      // Returning the existing identity makes repeated webhook delivery idempotent.
      if (error?.code !== '23505') throw error;
      const user = await this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (!user) throw error;
      const account = await this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, user.id) });
      return { created: false as const, accountId: account?.id ?? null, user, isPublicTrial: !!account };
    }
  }

  async issueToken(accountId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(publicTrialMagicLinks).set({ revokedAt: new Date() }).where(and(eq(publicTrialMagicLinks.accountId, accountId), isNull(publicTrialMagicLinks.consumedAt), isNull(publicTrialMagicLinks.revokedAt)));
      await tx.insert(publicTrialMagicLinks).values({ accountId, tokenHash, expiresAt });
    });
  }

  /** Conditional update makes two simultaneous POSTs yield exactly one session. */
  async consumeToken(tokenHash: string, now: Date) {
    const [link] = await this.db.update(publicTrialMagicLinks).set({ consumedAt: now })
      .where(and(eq(publicTrialMagicLinks.tokenHash, tokenHash), isNull(publicTrialMagicLinks.consumedAt), isNull(publicTrialMagicLinks.revokedAt), gt(publicTrialMagicLinks.expiresAt, now)))
      .returning({ accountId: publicTrialMagicLinks.accountId });
    if (!link) return null;
    const account = await this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.id, link.accountId) });
    if (!account) return null;
    const user = await this.db.query.users.findFirst({ where: and(eq(users.id, account.userId), isNull(users.deletedAt)) });
    return user;
  }
}
