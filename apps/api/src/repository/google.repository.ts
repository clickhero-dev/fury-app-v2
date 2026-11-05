import {
  db as defaultDb,
  type Database,
  googleConnections,
  googleBusinessProfiles,
  googleSyncLogs,
  businessProfileSettings,
} from '@fury/db';
import { and, eq } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type GoogleConnection = typeof googleConnections.$inferSelect;
type GoogleBusinessProfile = typeof googleBusinessProfiles.$inferSelect;
type GoogleSyncLog = typeof googleSyncLogs.$inferSelect;
type BusinessProfileSettings = typeof businessProfileSettings.$inferSelect;

/**
 * Repositório do domínio **Google / Google Business Profile**.
 * Agregado: `googleConnections` + `googleBusinessProfiles` + `googleSyncLogs`
 * + `businessProfileSettings`. ADR-0001.
 *
 * `findBusinessProfile` vem da base. Conexões e perfis resolvidos por id a partir
 * de `profile.connectionId` usam variantes GLOBAL (por id), já que o tenant é
 * garantido pela cadeia do perfil.
 */
export class GoogleRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  // ── Conexão Google ───────────────────────────────────────────────

  async findGoogleConnection() {
    return this.db.query.googleConnections.findFirst({
      where: eq(googleConnections.tenantId, this.tenantId),
    });
  }

  async findGoogleConnectionById(id: string) {
    return this.db.query.googleConnections.findFirst({
      where: and(eq(googleConnections.id, id), eq(googleConnections.tenantId, this.tenantId)),
    });
  }

  /** GLOBAL: resolve conexão por id puro (a partir de profile.connectionId). */
  async findGoogleConnectionByRawId(id: string) {
    return this.db.query.googleConnections.findFirst({
      where: eq(googleConnections.id, id),
    });
  }

  async createGoogleConnection(data: Partial<GoogleConnection>): Promise<GoogleConnection> {
    const [row] = await this.db.insert(googleConnections).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async patchGoogleConnection(id: string, data: Partial<GoogleConnection>) {
    const [row] = await this.db.update(googleConnections).set(data as any).where(eq(googleConnections.id, id)).returning();
    return row ?? null;
  }

  async deleteGoogleConnection(id: string) {
    await this.db.delete(googleConnections).where(and(eq(googleConnections.id, id), eq(googleConnections.tenantId, this.tenantId)));
  }

  // ── Business profile settings ────────────────────────────────────

  /** Upsert por tenant (atualiza se existir, senão insere). */
  async upsertBusinessProfile(data: Partial<BusinessProfileSettings>) {
    const existing = await this.findBusinessProfile();
    if (existing) {
      await this.db.update(businessProfileSettings).set(data as any).where(eq(businessProfileSettings.tenantId, this.tenantId));
      return existing.id;
    }
    const [row] = await this.db.insert(businessProfileSettings).values({ tenantId: this.tenantId, ...data } as any).returning();
    return row.id;
  }

  // ── Google Business Profiles ─────────────────────────────────────

  async createBusinessProfile(data: Partial<GoogleBusinessProfile>): Promise<GoogleBusinessProfile> {
    const [row] = await this.db.insert(googleBusinessProfiles).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async getBusinessProfile(id: string) {
    return this.db.query.googleBusinessProfiles.findFirst({
      where: and(eq(googleBusinessProfiles.id, id), eq(googleBusinessProfiles.tenantId, this.tenantId)),
    });
  }

  async patchBusinessProfile(id: string, data: Partial<GoogleBusinessProfile>) {
    const [row] = await this.db.update(googleBusinessProfiles).set(data as any).where(eq(googleBusinessProfiles.id, id)).returning();
    return row ?? null;
  }

  // ── Sync logs ────────────────────────────────────────────────────

  async createSyncLog(data: Partial<GoogleSyncLog>): Promise<GoogleSyncLog> {
    const [row] = await this.db.insert(googleSyncLogs).values({ ...data, tenantId: this.tenantId } as any).returning();
    return row;
  }

  async listSyncLogs(profileId: string, limit = 20) {
    return this.db.query.googleSyncLogs.findMany({
      where: eq(googleSyncLogs.profileId, profileId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit,
    });
  }
}