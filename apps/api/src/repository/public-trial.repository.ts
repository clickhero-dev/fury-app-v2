import crypto from 'node:crypto';
import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { db as defaultDb, type Database, plans, publicTrialAccounts, publicTrialMagicLinks, subscriptions, tenants, users } from '@fury/db';
import { buildDefaultTrialSubscription } from '../lib/trial-plan.js';

function matchesOriginalSignupEmail(account: { signupEmail: string | null } | undefined, email: string): boolean {
  // The current users.email can be changed; only the original signup address may request a link.
  return !!account?.signupEmail && account.signupEmail === email.toLowerCase();
}

/** Repositório global de aquisição: não há tenant antes do signup. */
export class PublicTrialRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async withPublicTrialSessionUser<T>(
    userId: string,
    issueSession: (user: typeof users.$inferSelect) => Promise<T>,
  ): Promise<T | null> {
    return this.db.transaction(async (tx) => {
      const [eligible] = await tx.select({ user: users, account: publicTrialAccounts })
        .from(users)
        .innerJoin(publicTrialAccounts, eq(publicTrialAccounts.userId, users.id))
        .where(and(
          eq(users.id, userId),
          isNotNull(publicTrialAccounts.signupEmail),
          sql`lower(${users.email}) = ${publicTrialAccounts.signupEmail}`,
        ))
        .for('update', { of: [users, publicTrialAccounts] });
      if (!eligible) return null;
      return issueSession(eligible.user);
    });
  }

  async createOrFindAccount(input: { name: string; email: string; phone?: string }) {
    const email = input.email.toLowerCase();
    try {
      return await this.db.transaction(async (tx) => {
        const accountBySignupEmail = await tx.query.publicTrialAccounts.findFirst({
          where: eq(publicTrialAccounts.signupEmail, email),
        });
        if (accountBySignupEmail) {
          const user = await tx.query.users.findFirst({ where: eq(users.id, accountBySignupEmail.userId) });
          const isPublicTrial = user?.email.toLowerCase() === email && matchesOriginalSignupEmail(accountBySignupEmail, email);
          const deliveryEmail = isPublicTrial ? accountBySignupEmail.signupEmail : null;
          return {
            created: false as const,
            accountId: isPublicTrial ? accountBySignupEmail.id : null,
            user: user ?? null,
            isPublicTrial,
            deliveryEmail,
          };
        }

        const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
        if (existing) {
          const account = await tx.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, existing.id) });
          const deliveryEmail = existing.email.toLowerCase() === email && matchesOriginalSignupEmail(account, email) ? account?.signupEmail ?? null : null;
          const isPublicTrial = deliveryEmail !== null;
          return { created: false as const, accountId: isPublicTrial ? account?.id ?? null : null, user: existing, isPublicTrial, deliveryEmail };
        }

        const [tenant] = await tx.insert(tenants).values({ name: input.name, slug: `trial-${crypto.randomUUID()}` }).returning();
        const [user] = await tx.insert(users).values({ tenantId: tenant.id, name: input.name, email, passwordHash: null, role: 'owner', emailVerified: false }).returning();
        const trialPlan = await tx.query.plans.findFirst({ where: eq(plans.name, 'Trial') });
        const now = new Date();
        const subscription = buildDefaultTrialSubscription(tenant.id, trialPlan ?? null, now);
        await tx.insert(subscriptions).values(subscription);
        const [account] = await tx.insert(publicTrialAccounts).values({
          tenantId: tenant.id,
          userId: user.id,
          signupEmail: email,
          phone: input.phone ?? null,
        }).returning({ id: publicTrialAccounts.id });
        return { created: true as const, accountId: account.id, user, isPublicTrial: true as const, deliveryEmail: email };
      });
    } catch (error) {
      const uniqueViolation = error as { code?: string; constraint?: string };
      const recoverableEmailConstraint = uniqueViolation.constraint === 'users_email_unique'
        || uniqueViolation.constraint === 'public_trial_accounts_signup_email_unique';
      if (uniqueViolation.code !== '23505' || !recoverableEmailConstraint) throw error;
      const accountBySignupEmail = await this.db.query.publicTrialAccounts.findFirst({
        where: eq(publicTrialAccounts.signupEmail, email),
      });
      if (accountBySignupEmail) {
        const user = await this.db.query.users.findFirst({ where: eq(users.id, accountBySignupEmail.userId) });
        const isPublicTrial = user?.email.toLowerCase() === email && matchesOriginalSignupEmail(accountBySignupEmail, email);
        const deliveryEmail = isPublicTrial ? accountBySignupEmail.signupEmail : null;
        return {
          created: false as const,
          accountId: isPublicTrial ? accountBySignupEmail.id : null,
          user: user ?? null,
          isPublicTrial,
          deliveryEmail,
        };
      }

      const user = await this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
      if (!user) throw error;
      const account = await this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, user.id) });
      const deliveryEmail = user.email.toLowerCase() === email && matchesOriginalSignupEmail(account, email) ? account?.signupEmail ?? null : null;
      const isPublicTrial = deliveryEmail !== null;
      return { created: false as const, accountId: isPublicTrial ? account?.id ?? null : null, user, isPublicTrial, deliveryEmail };
    }
  }

  async issueToken(accountId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(publicTrialMagicLinks).set({ revokedAt: new Date() }).where(and(
        eq(publicTrialMagicLinks.accountId, accountId),
        isNull(publicTrialMagicLinks.consumedAt),
        isNull(publicTrialMagicLinks.revokedAt),
      ));
      await tx.insert(publicTrialMagicLinks).values({ accountId, tokenHash, expiresAt });
    });
  }

  async consumeToken(tokenHash: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const [link] = await tx.update(publicTrialMagicLinks).set({ consumedAt: now }).where(and(
        eq(publicTrialMagicLinks.tokenHash, tokenHash),
        isNull(publicTrialMagicLinks.consumedAt),
        isNull(publicTrialMagicLinks.revokedAt),
        gt(publicTrialMagicLinks.expiresAt, now),
      )).returning({ accountId: publicTrialMagicLinks.accountId });
      if (!link) return null;
      const account = await tx.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.id, link.accountId) });
      if (!account) return null;
      const currentUser = await tx.query.users.findFirst({ where: eq(users.id, account.userId) });
      if (!account.signupEmail || !currentUser || !matchesOriginalSignupEmail(account, currentUser.email)) return null;
      const [user] = await tx.update(users).set({ emailVerified: true }).where(and(
        eq(users.id, account.userId),
        sql`lower(${users.email}) = ${account.signupEmail.toLowerCase()}`,
      )).returning();
      return user ?? null;
    });
  }
}
