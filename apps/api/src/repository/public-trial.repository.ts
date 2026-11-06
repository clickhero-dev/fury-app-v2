import { db as defaultDb, publicTrialAccounts, publicTrialMagicLinks, tenants, users, subscriptions, plans, type Database } from '@fury/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';

export class PublicTrialRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async findUserByNormalizedEmail(email: string) {
    return this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  }

  async findAccountByUserId(userId: string) {
    return this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, userId) });
  }

  async createAccount(input: { name: string; email: string; phone?: string }): Promise<{ accountId: string; user: typeof users.$inferSelect }> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (existing) {
        const account = await tx.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, existing.id) });
        return { accountId: account?.id ?? '', user: existing };
      }

      const slug = `${input.email.split('@')[0].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'trial'}-${Date.now().toString(36)}`;
      const [tenant] = await tx.insert(tenants).values({ name: input.name, slug }).returning();
      const [user] = await tx.insert(users).values({
        tenantId: tenant.id,
        name: input.name,
        email: input.email,
        passwordHash: null,
        role: 'owner',
        emailVerified: true,
      }).returning();
      const plan = await tx.query.plans.findFirst({ where: eq(plans.technicalKey, 'public_trial_signup') });
      if (!plan) throw new Error('public_trial_signup plan is not configured');
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: plan.id,
        status: 'trial',
        trialEndsAt: end,
        currentPeriodEnd: end,
        creativesRemaining: 7,
      });
      const [account] = await tx.insert(publicTrialAccounts).values({ tenantId: tenant.id, userId: user.id, phone: input.phone ?? null }).returning({ id: publicTrialAccounts.id });
      return { accountId: account.id, user };
    });
  }

  async issueMagicLink(accountId: string, tokenHash: string, expiresAt: Date) {
    return this.db.transaction(async (tx) => {
      await tx.update(publicTrialMagicLinks).set({ revokedAt: new Date() }).where(and(eq(publicTrialMagicLinks.accountId, accountId), isNull(publicTrialMagicLinks.consumedAt), isNull(publicTrialMagicLinks.revokedAt)));
      const [link] = await tx.insert(publicTrialMagicLinks).values({ accountId, tokenHash, expiresAt }).returning();
      return link;
    });
  }

  async consumeMagicLink(tokenHash: string) {
    const now = new Date();
    const [link] = await this.db.update(publicTrialMagicLinks)
      .set({ consumedAt: now })
      .where(and(eq(publicTrialMagicLinks.tokenHash, tokenHash), gt(publicTrialMagicLinks.expiresAt, now), isNull(publicTrialMagicLinks.consumedAt), isNull(publicTrialMagicLinks.revokedAt)))
      .returning({ accountId: publicTrialMagicLinks.accountId });
    if (!link) return null;
    const account = await this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.id, link.accountId) });
    if (!account) return null;
    const user = await this.db.query.users.findFirst({ where: eq(users.id, account.userId) });
    return user ? { account, user } : null;
  }
}
