import {
  db as defaultDb,
  type Database,
  formSubmissions,
} from '@fury/db';
import { and, eq } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type FormSubmission = typeof formSubmissions.$inferSelect;

/**
 * Repositório do domínio **Forms / submissions**.
 * Agregado: `formSubmissions`. ADR-0001.
 */
export class FormsRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  async createFormSubmission(data: Partial<FormSubmission>): Promise<FormSubmission> {
    const [row] = await this.db.insert(formSubmissions).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async findFormSubmission(id: string) {
    return this.db.query.formSubmissions.findFirst({
      where: and(eq(formSubmissions.id, id), eq(formSubmissions.tenantId, this.tenantId)),
    });
  }

  async patchFormSubmission(id: string, data: Partial<FormSubmission>) {
    const [row] = await this.db.update(formSubmissions).set(data as any).where(and(eq(formSubmissions.id, id), eq(formSubmissions.tenantId, this.tenantId))).returning();
    return row ?? null;
  }
}