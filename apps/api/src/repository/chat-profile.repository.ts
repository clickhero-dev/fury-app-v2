import { sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import { slugify } from '../lib/slug.js';
import { AppError } from '../middleware/errorHandler.js';

export interface ChatProfileValues { name?: string; tenantName?: string; businessContext?: string }
export interface ChatProfileSnapshot { name: string | null; tenantName: string; businessContext: string | null; userVersion: string; tenantVersion: string }
export class ChatProfileRepository extends TenantScopedRepository {
  async snapshot(userId: string): Promise<ChatProfileSnapshot | null> {
    const rows = await this.db.execute(sql`SELECT u.name, t.name AS "tenantName", t.business_context AS "businessContext",
      u.xmin::text AS "userVersion", t.xmin::text AS "tenantVersion"
      FROM users u JOIN tenants t ON t.id=u.tenant_id
      WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL`);
    return (rows[0] as unknown as ChatProfileSnapshot | undefined) ?? null;
  }
  async updateIfVersion(userId: string, userVersion: string, tenantVersion: string, values: ChatProfileValues): Promise<boolean> {
    try {
      return await this.db.transaction(async tx => {
        const rows = await tx.execute(sql`SELECT u.xmin::text AS "userVersion", t.xmin::text AS "tenantVersion"
          FROM users u JOIN tenants t ON t.id=u.tenant_id
          WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL FOR UPDATE OF u,t`);
        const current = rows[0];
        if (!current || current.userVersion !== userVersion || current.tenantVersion !== tenantVersion) return false;
        if (values.tenantName !== undefined) {
          const slug = slugify(values.tenantName);
          if (slug) {
            const others = await tx.execute(sql`SELECT slug,name FROM tenants WHERE id<>${this.tenantId}::uuid`);
            if (others.some(row => row.slug === slug || (typeof row.name === 'string' && slugify(row.name) === slug))) {
              throw new AppError(409, 'SLUG_EXISTS', 'Já existe um negócio com esse nome. Escolha outro nome.');
            }
          }
          await tx.execute(sql`UPDATE tenants SET name=${values.tenantName},slug=coalesce(${slug || null},slug) WHERE id=${this.tenantId}::uuid`);
        }
        if (values.businessContext !== undefined) await tx.execute(sql`UPDATE tenants SET business_context=${values.businessContext || null} WHERE id=${this.tenantId}::uuid`);
        if (values.name !== undefined) await tx.execute(sql`UPDATE users SET name=${values.name} WHERE id=${userId}::uuid AND tenant_id=${this.tenantId}::uuid`);
        return true;
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') throw new AppError(409, 'SLUG_EXISTS', 'Já existe um negócio com esse nome. Escolha outro nome.');
      throw err;
    }
  }
}
