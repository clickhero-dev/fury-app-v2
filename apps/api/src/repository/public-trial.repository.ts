import { db as defaultDb, publicTrialAccounts, publicTrialMagicLinks, tenants, users, subscriptions, plans, type Database } from '@fury/db';
import { and, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { PUBLIC_TRIAL_IMAGE_LIMIT, PUBLIC_TRIAL_PLAN_KEY } from '../services/core/public-trial-signup.js';
import { createTemporaryPassword, MAGIC_LINK_MAX_USES } from '../services/core/public-trial-signup.js';

export class PublicTrialRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async findUserByNormalizedEmail(email: string) {
    return this.db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  }

  async findAccountByUserId(userId: string) {
    return this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.userId, userId) });
  }

  async createAccount(input: { name: string; email: string; phone?: string }): Promise<{ accountId: string; user: typeof users.$inferSelect; temporaryPassword?: string }> {
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${input.email}` });
      if (existing) {
        return { accountId: '', user: existing };
      }

      const slug = `${input.email.split('@')[0].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'trial'}-${Date.now().toString(36)}`;
      const [tenant] = await tx.insert(tenants).values({ name: input.name, slug }).returning();
      const temporaryPassword = createTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const [user] = await tx.insert(users).values({
        tenantId: tenant.id,
        name: input.name,
        email: input.email,
        passwordHash,
        mustChangePassword: true,
        role: 'owner',
        emailVerified: true,
      }).returning();
      const plan = await tx.query.plans.findFirst({ where: and(eq(plans.technicalKey, PUBLIC_TRIAL_PLAN_KEY), isNull(plans.partnerId)) });
      if (!plan) throw new Error('public_trial_signup plan is not configured');
      await tx.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: plan.id,
        status: 'trial',
        // A janela de sete dias começa no primeiro acesso bem-sucedido, não no
        // recebimento do webhook nem no envio do e-mail.
        trialEndsAt: null,
        currentPeriodEnd: null,
        creativesRemaining: PUBLIC_TRIAL_IMAGE_LIMIT,
      });
      const [account] = await tx.insert(publicTrialAccounts).values({ tenantId: tenant.id, userId: user.id, phone: input.phone ?? null }).returning({ id: publicTrialAccounts.id });
      return { accountId: account.id, user, temporaryPassword };
    });
  }

  async issueMagicLink(accountId: string, tokenHash: string, expiresAt: Date) {
    return this.db.transaction(async (tx) => {
      const cooldownSince = new Date(Date.now() - 5 * 60 * 1000);
      const recent = await tx.query.publicTrialMagicLinks.findFirst({
        where: and(
          eq(publicTrialMagicLinks.accountId, accountId),
          gte(publicTrialMagicLinks.createdAt, cooldownSince),
          isNull(publicTrialMagicLinks.consumedAt),
          isNull(publicTrialMagicLinks.revokedAt),
        ),
      });
      if (recent) return null;

      await tx.update(publicTrialMagicLinks).set({ revokedAt: new Date() }).where(and(eq(publicTrialMagicLinks.accountId, accountId), isNull(publicTrialMagicLinks.consumedAt), isNull(publicTrialMagicLinks.revokedAt)));
      const [link] = await tx.insert(publicTrialMagicLinks).values({ accountId, tokenHash, expiresAt }).returning();
      return link;
    });
  }

  async consumeMagicLink(tokenHash: string) {
    const now = new Date();
    const [link] = await this.db.update(publicTrialMagicLinks)
      .set({ useCount: sql`${publicTrialMagicLinks.useCount} + 1`, consumedAt: sql`CASE WHEN ${publicTrialMagicLinks.useCount} + 1 >= ${MAGIC_LINK_MAX_USES} THEN ${now.toISOString()}::timestamptz ELSE NULL END` })
      .where(and(eq(publicTrialMagicLinks.tokenHash, tokenHash), gt(publicTrialMagicLinks.expiresAt, now), isNull(publicTrialMagicLinks.consumedAt), lt(publicTrialMagicLinks.useCount, MAGIC_LINK_MAX_USES), isNull(publicTrialMagicLinks.revokedAt)))
      .returning({ accountId: publicTrialMagicLinks.accountId });
    if (!link) return null;
    const account = await this.db.query.publicTrialAccounts.findFirst({ where: eq(publicTrialAccounts.id, link.accountId) });
    if (!account) return null;
    const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Só a primeira troca bem-sucedida do link inicia a janela; o UPDATE
    // condicional preserva a data em sessões/login posteriores.
    await this.db.update(subscriptions)
      .set({ trialEndsAt: trialEnd, currentPeriodEnd: trialEnd, updatedAt: now })
      .where(and(eq(subscriptions.tenantId, account.tenantId), eq(subscriptions.status, 'trial'), isNull(subscriptions.trialEndsAt)));
    const user = await this.db.query.users.findFirst({ where: eq(users.id, account.userId) });
    return user ? { account, user } : null;
  }
}
