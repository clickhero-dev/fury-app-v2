import {
  db as defaultDb,
  type Database,
  brandKits,
  clientGoals,
  metaConnections,
  tenants,
  users,
  businessProfileSettings,
} from '@fury/db';
import { eq } from 'drizzle-orm';

/**
 * Base de todos os repositórios tenant-scoped.
 *
 * O construtor já carrega `tenantId` (e `db`, com default) — os métodos não
 * recebem tenantId como parâmetro, pois o escopo é resolvido aqui.
 *
 * Hospeda as **lookups compartilhadas** (lidas por vários domínios):
 * tenant, brand kit, client goal, conexão Meta, perfil de negócio e usuário.
 * ADR-0001.
 */
export abstract class TenantScopedRepository {
  constructor(
    protected readonly tenantId: string,
    protected readonly db: Database = defaultDb,
  ) {}

  async findTenant() {
    return this.db.query.tenants.findFirst({ where: eq(tenants.id, this.tenantId) });
  }

  async findBrandKit() {
    return this.db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, this.tenantId) });
  }

  async findClientGoal() {
    return this.db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, this.tenantId) });
  }

  async findBusinessProfile() {
    return this.db.query.businessProfileSettings.findFirst({
      where: eq(businessProfileSettings.tenantId, this.tenantId),
    });
  }

  async findUserByTenant() {
    return this.db.query.users.findFirst({ where: eq(users.tenantId, this.tenantId) });
  }

  /** Conexão Meta atual do tenant (qualquer estado). */
  async findMetaConnection() {
    return this.db.query.metaConnections.findFirst({
      where: eq(metaConnections.tenantId, this.tenantId),
    });
  }
}