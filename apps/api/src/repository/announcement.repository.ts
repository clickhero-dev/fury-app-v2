import { db as defaultDb, type Database, announcements, announcementViews, users, tenants } from '@fury/db';
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, notExists, notInArray, or, sql } from 'drizzle-orm';

export class AnnouncementRepository {
  constructor(private db: Database = defaultDb) {}

  listAdmin() { return this.db.query.announcements.findMany({ where: isNull(announcements.deletedAt), orderBy: [desc(announcements.updatedAt)] }); }
  findById(id: string) { return this.db.query.announcements.findFirst({ where: and(eq(announcements.id, id), isNull(announcements.deletedAt)) }); }
  async create(data: typeof announcements.$inferInsert) { const [row] = await this.db.insert(announcements).values(data).returning(); return row; }
  async update(id: string, data: Partial<typeof announcements.$inferInsert>) {
    const [row] = await this.db.update(announcements).set({ ...data, updatedAt: new Date() }).where(eq(announcements.id, id)).returning(); return row ?? null;
  }
  // Soft delete
  async delete(id: string) { await this.db.update(announcements).set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() }).where(eq(announcements.id, id)); }

  // Só 'Ativo' = só quem já existia; 'Manter ativo' ou data = todos
  listPending(userId: string) {
    return this.db
      .select({ id: announcements.id, title: announcements.title, markdown: announcements.markdown })
      .from(announcements)
      .innerJoin(users, eq(users.id, userId))
      .where(and(
        eq(announcements.isActive, true),
        isNull(announcements.deletedAt),
        // avisos são só para clientes do ady: parceiro e clientes dele não recebem
        notInArray(users.platformRole, ['admin_partner', 'user_partner']),
        notExists(this.db.select({ one: sql`1` }).from(tenants).where(and(eq(tenants.id, users.tenantId), isNotNull(tenants.partnerId)))),
        isNotNull(announcements.publishedAt),
        or(isNull(announcements.endsAt), gt(announcements.endsAt, sql`now()`)),
        or(eq(announcements.showToNewUsers, true), isNotNull(announcements.endsAt), gte(announcements.publishedAt, users.createdAt)),
        notExists(this.db.select({ one: sql`1` }).from(announcementViews).where(and(
          eq(announcementViews.userId, userId),
          eq(announcementViews.announcementId, announcements.id),
        ))),
      ))
      .orderBy(asc(announcements.publishedAt));
  }

  async markSeen(userId: string, announcementId: string) {
    await this.db.insert(announcementViews).values({ userId, announcementId }).onConflictDoNothing();
  }
}
