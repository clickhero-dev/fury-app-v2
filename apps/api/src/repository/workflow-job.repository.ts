import {
  db as defaultDb,
  type Database,
  workflowJobs,
} from '@fury/db';
import { and, count, desc, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type WorkflowJob = typeof workflowJobs.$inferSelect;

/**
 * Repositório **WorkflowJobs / State Machine (GLOBAL)** — estados de jobs de
 * workflow que atravessam tenants. Não é escopado por tenant. ADR-0001.
 */
export class WorkflowJobRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  async createWorkflowJob(data: Partial<WorkflowJob>): Promise<void> {
    await this.db.insert(workflowJobs).values(data as any);
  }

  async getWorkflowJob(id: string) {
    return this.db.query.workflowJobs.findFirst({ where: eq(workflowJobs.id, id) });
  }

  async patchWorkflowJob(id: string, patch: Partial<WorkflowJob>): Promise<void> {
    await this.db.update(workflowJobs).set(patch as any).where(eq(workflowJobs.id, id));
  }

  /**
   * Claim de um lote do Estúdio. O advisory lock torna o replay atômico por
   * tenant+lote sem exigir migration/índice novo em `workflow_jobs`.
   */
  async findOrCreateStudioVariationsJob(data: {
    id: string;
    tenantId: string;
    assetId: string;
    origin: 'quick' | 'creative';
  }) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`studio-variations:${data.tenantId}:${data.id}`}))`);
      const [existing] = await tx
        .select()
        .from(workflowJobs)
        .where(and(eq(workflowJobs.id, data.id), eq(workflowJobs.tenantId, data.tenantId), eq(workflowJobs.workflow, 'studio-creative-variations')))
        .limit(1);
      if (existing) return existing;
      const [created] = await tx
        .insert(workflowJobs)
        .values({
          id: data.id,
          tenantId: data.tenantId,
          workflow: 'studio-creative-variations',
          status: 'pending',
          lockKey: `${data.tenantId}:${data.assetId}:${data.id}`,
          currentStage: 'queued',
          metadata: { batchId: data.id, assetId: data.assetId, origin: data.origin, slots: [] },
        } as any)
        .returning();
      return created;
    });
  }

  async getStudioVariationsJob(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(workflowJobs)
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.tenantId, tenantId), eq(workflowJobs.workflow, 'studio-creative-variations')))
      .limit(1);
    return row ?? null;
  }

  async claimStudioVariationsJob(id: string, tenantId: string, metadata: unknown) {
    const [row] = await this.db
      .update(workflowJobs)
      .set({ status: 'running', currentStage: 'generating', metadata: metadata as any, updatedAt: new Date() })
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.tenantId, tenantId), eq(workflowJobs.workflow, 'studio-creative-variations'), eq(workflowJobs.status, 'pending')))
      .returning({ id: workflowJobs.id });
    return !!row;
  }

  async listRecoverableWorkflowJobs(opts?: { workflow?: string; sinceMs?: number }) {
    const cutoff = opts?.sinceMs ? new Date(Date.now() - opts.sinceMs) : new Date(0);
    const conditions = [
      // awaiting_images = job que enfileirou as imagens mas nunca foi marcado done
      // (imagem falhou/worker morreu) — é recuperável tanto quanto running/pending.
      or(
        eq(workflowJobs.status, 'running'),
        eq(workflowJobs.status, 'pending'),
        eq(workflowJobs.status, 'awaiting_images'),
      ),
      lt(workflowJobs.updatedAt, cutoff),
    ];
    if (opts?.workflow) conditions.push(eq(workflowJobs.workflow, opts.workflow));
    return this.db.query.workflowJobs.findMany({
      where: and(...conditions),
      orderBy: [desc(workflowJobs.createdAt)],
    });
  }

  async findActiveWorkflowJobByLockKey(lockKey: string, workflow: string) {
    return this.db.query.workflowJobs.findFirst({
      where: and(
        eq(workflowJobs.lockKey, lockKey),
        eq(workflowJobs.workflow, workflow),
        or(eq(workflowJobs.status, 'running'), eq(workflowJobs.status, 'pending')),
      ),
    });
  }

  async findWorkflowJobByPlanId(planId: string) {
    return this.db.query.workflowJobs.findFirst({
      where: eq(workflowJobs.planId, planId),
      orderBy: [desc(workflowJobs.createdAt)],
    });
  }

  async renewWorkflowJobLock(id: string): Promise<void> {
    await this.db.update(workflowJobs).set({ updatedAt: new Date() }).where(eq(workflowJobs.id, id));
  }

  async listTenantWorkflowJobs(
    tenantId: string,
    workflow: string,
    statuses: Array<WorkflowJob['status']>,
  ) {
    return this.db.query.workflowJobs.findMany({
      where: and(
        eq(workflowJobs.tenantId, tenantId),
        eq(workflowJobs.workflow, workflow),
        inArray(workflowJobs.status, statuses),
      ),
      orderBy: [desc(workflowJobs.createdAt)],
    });
  }

  /**
   * Cria o job só se o tenant tiver menos de `limit` jobs ativos (ignora os sem
   * heartbeat desde `staleBefore`) e, com `period`, se não estourou a cota do período
   * (conta jobs não falhos sem metadata.rootAssetId). Lock por tenant+workflow evita corrida.
   */
  async createTenantJobIfUnderLimit(
    data: Partial<WorkflowJob> & { tenantId: string; workflow: string },
    limit: number,
    staleBefore: Date,
    period?: { since: Date; limit: number },
  ): Promise<'created' | 'active_limit' | 'period_limit'> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${data.tenantId}:${data.workflow}`}))`);
      const [row] = await tx
        .select({ n: count() })
        .from(workflowJobs)
        .where(
          and(
            eq(workflowJobs.tenantId, data.tenantId),
            eq(workflowJobs.workflow, data.workflow),
            inArray(workflowJobs.status, ['pending', 'running']),
            gt(workflowJobs.updatedAt, staleBefore),
          ),
        );
      if (Number(row?.n ?? 0) >= limit) return 'active_limit';
      if (period) {
        const used = await this.countPeriodJobs(data.tenantId, data.workflow, period.since, tx);
        if (used >= period.limit) return 'period_limit';
      }
      await tx.insert(workflowJobs).values(data as any);
      return 'created';
    });
  }

  /** Jobs "novos" (sem rootAssetId) não falhos desde `since` — base da cota mensal. */
  async countPeriodJobs(tenantId: string, workflow: string, since: Date, db: Pick<Database, 'select'> = this.db): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(workflowJobs)
      .where(
        and(
          eq(workflowJobs.tenantId, tenantId),
          eq(workflowJobs.workflow, workflow),
          inArray(workflowJobs.status, ['pending', 'running', 'done']),
          gte(workflowJobs.createdAt, since),
          sql`${workflowJobs.metadata}->>'rootAssetId' is null`,
        ),
      );
    return Number(row?.n ?? 0);
  }
}
