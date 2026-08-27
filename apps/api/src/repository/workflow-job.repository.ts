import {
  db as defaultDb,
  type Database,
  workflowJobs,
} from '@fury/db';
import { and, desc, eq, lt, or } from 'drizzle-orm';
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
      or(eq(workflowJobs.status, 'running'), eq(workflowJobs.status, 'pending')),
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
}