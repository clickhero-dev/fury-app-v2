import { db as defaultDb, type Database, notifications, users } from '@fury/db';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';

export type NotificationRow = typeof notifications.$inferSelect;

export class NotificationRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async findUserInTenant(userId: string, tenantId: string) {
    return this.db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.tenantId, tenantId)) });
  }

  async findByIdempotencyKey(tenantId: string, createdByUserId: string, idempotencyKey: string) {
    return this.db.query.notifications.findFirst({ where: and(eq(notifications.tenantId, tenantId), eq(notifications.createdByUserId, createdByUserId), eq(notifications.idempotencyKey, idempotencyKey)) });
  }

  async create(data: typeof notifications.$inferInsert) {
    const [row] = await this.db.insert(notifications).values(data).returning();
    return row;
  }

  async list(tenantId: string, userId: string, limit: number, cursor?: { createdAt: Date; id: string }) {
    const boundary = cursor
      ? or(lt(notifications.createdAt, cursor.createdAt), and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)))
      : undefined;
    return this.db.select().from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.recipientUserId, userId), gt(notifications.createdAt, sql`now() - interval '90 days'`), boundary))
      .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit + 1);
  }

  async unreadCount(tenantId: string, userId: string) {
    const [row] = await this.db.select({ count: sql<number>`count(*)` }).from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.recipientUserId, userId), isNull(notifications.readAt), gt(notifications.createdAt, sql`now() - interval '90 days'`)));
    return Number(row?.count ?? 0);
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const [row] = await this.db.update(notifications).set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId), eq(notifications.recipientUserId, userId))).returning();
    return row ?? null;
  }

  async markAllRead(tenantId: string, userId: string) {
    const rows = await this.db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.recipientUserId, userId), isNull(notifications.readAt), gt(notifications.createdAt, sql`now() - interval '90 days'`))).returning({ id: notifications.id });
    return rows.length;
  }

  async deleteExpiredBatch(batchSize = 500) {
    const result = await this.db.execute(sql`DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at <= now() - interval '90 days' ORDER BY created_at ASC LIMIT ${batchSize})`);
    return Number((result as { count?: number }).count ?? 0);
  }
}
