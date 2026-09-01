import {
  db as defaultDb,
  type Database,
  users,
  tenants,
} from '@fury/db';
import { and, eq, ne } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import { slugify } from '../lib/slug.js';

type User = typeof users.$inferSelect;
type Tenant = typeof tenants.$inferSelect;

/**
 * Repositório do domínio **Auth / identidade**.
 * Agregado: `users` + `tenants` (parcial). ADR-0001.
 *
 * Buscas por email/slug/googleId são GLOBAL (acontecem antes de resolver o
 * tenant) e o construtor aceita placeholder `''`.
 */
export class AuthRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  async findTenantBySlug(slug: string) {
    return this.db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  }

  /**
   * Encontra um tenant que conflita com o slug candidato — OU pela coluna
   * `slug` OU por `slugify(name)` (a coluna legada pode divergir do nome
   * atual, e o resolveTenantId também resolve por slugify(name)). Exclui o
   * próprio tenant (renomear para um nome que gera o MESMO slug não é
   * conflito). Usado no updateMe para barrar troca de nome com slug ocupado.
   */
  async findTenantSlugConflict(slug: string, excludeTenantId?: string) {
    const bySlug = await this.db.query.tenants.findFirst({
      where: excludeTenantId
        ? and(eq(tenants.slug, slug), ne(tenants.id, excludeTenantId))
        : eq(tenants.slug, slug),
    });
    if (bySlug) return bySlug;

    const all = await this.db.query.tenants.findMany({ columns: { id: true, name: true } });
    return all.find((t) => t.id !== excludeTenantId && !!t.name && slugify(t.name) === slug) ?? null;
  }

  async findUserByEmail(email: string) {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  async findUserByGoogleId(googleId: string) {
    return this.db.query.users.findFirst({ where: eq(users.googleId, googleId) });
  }

  async findUserById(id: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  async createTenant(data: Partial<Tenant>): Promise<Tenant> {
    const [row] = await this.db.insert(tenants).values(data as any).returning();
    return row;
  }

  async patchTenant(id: string, data: Partial<Tenant>) {
    const [row] = await this.db.update(tenants).set(data as any).where(eq(tenants.id, id)).returning();
    return row ?? null;
  }

  async createUser(data: Partial<User>): Promise<User> {
    const [row] = await this.db.insert(users).values(data as any).returning();
    return row;
  }

  async patchUser(id: string, data: Partial<User>) {
    const [row] = await this.db.update(users).set(data as any).where(eq(users.id, id)).returning();
    return row ?? null;
  }
}