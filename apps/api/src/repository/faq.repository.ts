import { db as defaultDb, type Database, faqs, faqSlugRedirects } from '@fury/db';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

export class FaqRepository {
  constructor(private db: Database = defaultDb) {}

  listAdmin() { return this.db.query.faqs.findMany({ orderBy: [desc(faqs.updatedAt)] }); }
  findById(id: string) { return this.db.query.faqs.findFirst({ where: eq(faqs.id, id) }); }
  findBySlug(slug: string) { return this.db.query.faqs.findFirst({ where: eq(faqs.slug, slug) }); }
  async create(data: typeof faqs.$inferInsert) { const [row] = await this.db.insert(faqs).values(data).returning(); return row; }
  async update(id: string, data: Partial<typeof faqs.$inferInsert>) {
    const [row] = await this.db.update(faqs).set({ ...data, updatedAt: new Date() }).where(eq(faqs.id, id)).returning(); return row ?? null;
  }
  async delete(id: string) { await this.db.delete(faqs).where(eq(faqs.id, id)); }
  async addSlugRedirect(slug: string, faqId: string) {
    await this.db.insert(faqSlugRedirects).values({ slug, faqId }).onConflictDoNothing();
  }
  searchPublished(query: string, limit: number, offset: number) {
    const where = query ? and(eq(faqs.status, 'published'), or(ilike(faqs.title, `%${query}%`), ilike(faqs.markdown, `%${query}%`))) : eq(faqs.status, 'published');
    return this.db.query.faqs.findMany({ where, columns: { id: true, title: true, slug: true, updatedAt: true, publishedAt: true }, orderBy: [desc(faqs.updatedAt)], limit, offset });
  }
  findPublishedBySlug(slug: string) { return this.db.query.faqs.findFirst({ where: and(eq(faqs.slug, slug), eq(faqs.status, 'published')) }); }
  findRedirect(slug: string) { return this.db.query.faqSlugRedirects.findFirst({ where: eq(faqSlugRedirects.slug, slug), with: { faq: true } }); }
}
