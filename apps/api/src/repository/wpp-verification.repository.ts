import { db as defaultDb, type Database, wppVerifications } from '@fury/db';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type WppVerification = typeof wppVerifications.$inferSelect;

/**
 * Repositório do domínio **WhatsApp — verificação de número** (tenant-bound).
 * ADR-0001. O código de verificação é armazenado apenas como hash.
 */
export class WppVerificationRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  async createPending(data: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<WppVerification> {
    const [row] = await this.db
      .insert(wppVerifications)
      .values({
        tenantId: this.tenantId,
        phone: data.phone,
        codeHash: data.codeHash,
        status: 'pending',
        expiresAt: data.expiresAt,
      } as any)
      .returning();
    return row;
  }

  /** Pending mais recente do tenant para o telefone (auto-confirmação/confirm). */
  async findLatestPendingByPhone(phone: string): Promise<WppVerification | undefined> {
    return this.db.query.wppVerifications.findFirst({
      where: and(
        eq(wppVerifications.tenantId, this.tenantId),
        eq(wppVerifications.phone, phone),
        eq(wppVerifications.status, 'pending'),
      ),
      orderBy: [desc(wppVerifications.createdAt)],
    });
  }

  /** Pending mais recente do telefone SEM filtro de tenant (GLOBAL — usado pela
   *  auto-confirmação do webhook, que descobre o tenant na row). Construtor `''`. */
  async findLatestPendingByPhoneGlobal(phone: string): Promise<WppVerification | undefined> {
    return this.db.query.wppVerifications.findFirst({
      where: and(
        eq(wppVerifications.phone, phone),
        eq(wppVerifications.status, 'pending'),
      ),
      orderBy: [desc(wppVerifications.createdAt)],
    });
  }

  async findById(id: string): Promise<WppVerification | undefined> {
    return this.db.query.wppVerifications.findFirst({
      where: and(eq(wppVerifications.tenantId, this.tenantId), eq(wppVerifications.id, id)),
    });
  }

  /** Última verificação do tenant (qualquer status) — status() do service. */
  async findLatestByTenant(): Promise<WppVerification | undefined> {
    return this.db.query.wppVerifications.findFirst({
      where: eq(wppVerifications.tenantId, this.tenantId),
      orderBy: [desc(wppVerifications.createdAt)],
    });
  }

  async markVerified(id: string): Promise<WppVerification | undefined> {
    const [row] = await this.db
      .update(wppVerifications)
      .set({ status: 'verified', verifiedAt: new Date(), updatedAt: new Date() } as any)
      .where(
        and(eq(wppVerifications.tenantId, this.tenantId), eq(wppVerifications.id, id)),
      )
      .returning();
    return row ?? undefined;
  }

  async markFailed(id: string): Promise<void> {
    await this.db
      .update(wppVerifications)
      .set({ status: 'failed', updatedAt: new Date() } as any)
      .where(and(eq(wppVerifications.tenantId, this.tenantId), eq(wppVerifications.id, id)));
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .update(wppVerifications)
      .set({ status: 'expired', updatedAt: new Date() } as any)
      .where(and(eq(wppVerifications.tenantId, this.tenantId), eq(wppVerifications.id, id)));
  }

  async incrementAttempts(id: string): Promise<WppVerification | undefined> {
    const [row] = await this.db
      .update(wppVerifications)
      .set({
        attempts: sql`${wppVerifications.attempts} + 1`,
        updatedAt: new Date(),
      } as any)
      .where(
        and(eq(wppVerifications.tenantId, this.tenantId), eq(wppVerifications.id, id)),
      )
      .returning();
    return row ?? undefined;
  }

  /** Nº de envios do telefone desde `since` (rate limit por número). */
  async countSentSince(phone: string, since: Date): Promise<number> {
    const rows = await this.db.query.wppVerifications.findMany({
      where: and(
        eq(wppVerifications.tenantId, this.tenantId),
        eq(wppVerifications.phone, phone),
        gte(wppVerifications.lastSentAt, since),
      ),
    });
    return rows.length;
  }
}
