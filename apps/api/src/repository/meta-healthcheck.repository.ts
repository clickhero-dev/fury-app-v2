import {
  db as defaultDb,
  type Database,
  metaConnections,
  metaHealthchecks,
  metaSyncRuns,
  tenants,
  users,
} from '@fury/db';
import { desc, eq } from 'drizzle-orm';

export interface MetaHealthcheckRecord {
  tenantId: string;
  checkedAt: Date;
  status: 'success' | 'partial' | 'failed';
  checks: Record<string, unknown>;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
}

/** Repositório GLOBAL: consultas e gravações de diagnóstico cruzam tenants. */
export class MetaHealthcheckRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async listUsers() {
    return this.db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tenantId: tenants.id,
        tenantName: tenants.name,
        connectionId: metaConnections.id,
        adAccountId: metaConnections.selectedAdAccountId,
        instagramUserId: metaConnections.selectedInstagramUserId,
        checkedAt: metaHealthchecks.checkedAt,
        status: metaHealthchecks.status,
        checks: metaHealthchecks.checks,
        lastSyncAt: metaHealthchecks.lastSyncAt,
        lastSyncStatus: metaHealthchecks.lastSyncStatus,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .leftJoin(metaConnections, eq(tenants.id, metaConnections.tenantId))
      .leftJoin(metaHealthchecks, eq(tenants.id, metaHealthchecks.tenantId))
      .orderBy(users.name, users.email);
  }

  async findUser(userId: string) {
    const [row] = await this.db
      .select({
        userId: users.id,
        tenantId: users.tenantId,
        name: users.name,
        email: users.email,
        tenantName: tenants.name,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async findLatest(tenantId: string) {
    return (await this.db.query.metaHealthchecks.findFirst({
      where: eq(metaHealthchecks.tenantId, tenantId),
    })) ?? null;
  }

  async findLatestSyncRun(tenantId: string) {
    return (await this.db.query.metaSyncRuns.findFirst({
      where: eq(metaSyncRuns.tenantId, tenantId),
      orderBy: [desc(metaSyncRuns.startedAt)],
    })) ?? null;
  }

  async saveLatest(record: MetaHealthcheckRecord): Promise<MetaHealthcheckRecord> {
    const [row] = await this.db
      .insert(metaHealthchecks)
      .values({
        tenantId: record.tenantId,
        checkedAt: record.checkedAt,
        status: record.status,
        checks: record.checks as any,
        lastSyncAt: record.lastSyncAt,
        lastSyncStatus: record.lastSyncStatus,
      })
      .onConflictDoUpdate({
        target: metaHealthchecks.tenantId,
        set: {
          checkedAt: record.checkedAt,
          status: record.status,
          checks: record.checks as any,
          lastSyncAt: record.lastSyncAt,
          lastSyncStatus: record.lastSyncStatus,
        },
      })
      .returning();
    return row as MetaHealthcheckRecord;
  }
}
