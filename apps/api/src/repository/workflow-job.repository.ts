import {
  db as defaultDb,
  type Database,
  workflowJobs,
} from '@fury/db';
import { and, count, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
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
   * heartbeat desde `staleBefore`). Lock por tenant+workflow evita corrida.
   */
  async createTenantJobIfUnderLimit(
    data: Partial<WorkflowJob> & { tenantId: string; workflow: string },
    limit: number,
    staleBefore: Date,
  ): Promise<boolean> {
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
      if (Number(row?.n ?? 0) >= limit) return false;
      await tx.insert(workflowJobs).values(data as any);
      return true;
    });
  }
}
