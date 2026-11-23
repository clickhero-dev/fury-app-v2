import {
  db as defaultDb,
  type Database,
  workflowJobs,
  creativeAssets,
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

  async claimVideoJob(id: string, token?: string) {
    const [row] = await this.db.update(workflowJobs)
      .set({ status: 'running', videoLeaseToken: token ?? null, updatedAt: new Date() })
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.workflow, 'studio-video'), eq(workflowJobs.status, 'pending')))
      .returning();
    return row ?? null;
  }

  async claimResumableVideoJob(id: string, token: string) {
    const [row] = await this.db.update(workflowJobs)
      .set({ videoLeaseToken: token, updatedAt: new Date() })
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.workflow, 'studio-video'),
        eq(workflowJobs.status, 'running'), lt(workflowJobs.updatedAt, new Date(Date.now() - 10 * 60_000)),
        sql`nullif(${workflowJobs.metadata}->>'openrouterJobId', '') is not null`))
      .returning();
    return row ?? null;
  }

  async patchOwnedVideoJob(id: string, token: string, patch: Partial<WorkflowJob>): Promise<boolean> {
    const [row] = await this.db.update(workflowJobs).set(patch as any)
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.workflow, 'studio-video'),
        eq(workflowJobs.status, 'running'), eq(workflowJobs.videoLeaseToken, token)))
      .returning({ id: workflowJobs.id });
    return Boolean(row);
  }

  async completeOwnedVideoJob(id: string, token: string, asset: Partial<typeof creativeAssets.$inferInsert>, metadata: unknown) {
    return this.db.transaction(async tx => {
      const [owned] = await tx.select().from(workflowJobs).where(and(eq(workflowJobs.id, id),
        eq(workflowJobs.workflow, 'studio-video'), eq(workflowJobs.status, 'running'),
        eq(workflowJobs.videoLeaseToken, token))).for('update');
      if (!owned || asset.tenantId !== owned.tenantId) return null;
      const [created] = await tx.insert(creativeAssets).values({ ...asset, id } as any).returning();
      if (asset.rootAssetId) {
        const [root] = await tx.update(creativeAssets).set({ activeAssetId: id })
          .where(and(eq(creativeAssets.id, asset.rootAssetId), eq(creativeAssets.tenantId, owned.tenantId))).returning();
        if (!root) throw new Error('Raiz do vídeo não encontrada');
      }
      await tx.update(workflowJobs).set({ status: 'done', currentStage: 'done', metadata: metadata as any,
        artifacts: { assetId: id, videoUrl: asset.url }, updatedAt: new Date() }).where(eq(workflowJobs.id, id));
      return created;
    });
  }

  async failOwnedVideoJob(id: string, token: string, message: string, metadata: unknown, refund: boolean): Promise<boolean> {
    return this.db.transaction(async tx => {
      const [owned] = await tx.select().from(workflowJobs).where(and(eq(workflowJobs.id, id),
        eq(workflowJobs.workflow, 'studio-video'), eq(workflowJobs.status, 'running'),
        eq(workflowJobs.videoLeaseToken, token))).for('update');
      if (!owned) return false;
      const rootId = (owned.metadata as { rootAssetId?: string | null } | null)?.rootAssetId;
      if (refund && rootId) {
        const [root] = await tx.update(creativeAssets)
          .set({ modificationsRemaining: sql`${creativeAssets.modificationsRemaining} + 1` })
          .where(and(eq(creativeAssets.id, rootId), eq(creativeAssets.tenantId, owned.tenantId))).returning({ id: creativeAssets.id });
        if (!root) throw new Error('Raiz do vídeo não encontrada');
      }
      await tx.update(workflowJobs).set({ status: 'error', error: message, metadata: metadata as any, updatedAt: new Date() })
        .where(eq(workflowJobs.id, id));
      return true;
    });
  }

  async reserveVideoAdjustment(input: { id: string; tenantId: string; rootAssetId: string; approvalId?: string }, limit: number): Promise<'created'|'exists'|'active_limit'|'quota'|'approval_inactive'> {
    return this.db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.tenantId}:studio-video`}))`);
      if (input.approvalId) {
        const approval = await tx.execute(sql`SELECT id FROM chat_approvals WHERE id=${input.approvalId}::uuid AND tenant_id=${input.tenantId}::uuid AND status='executing' FOR UPDATE`);
        if (!approval.length || input.id !== input.approvalId) return 'approval_inactive';
      }
      const [existing] = await tx.select({id:workflowJobs.id}).from(workflowJobs).where(eq(workflowJobs.id,input.id));
      if (existing) return 'exists';
      const [active] = await tx.select({n:count()}).from(workflowJobs).where(and(eq(workflowJobs.tenantId,input.tenantId),eq(workflowJobs.workflow,'studio-video'),inArray(workflowJobs.status,['pending','running','awaiting_images']),gt(workflowJobs.updatedAt,new Date(Date.now()-10*60_000))));
      if (Number(active.n) >= limit) return 'active_limit';
      const [root] = await tx.update(creativeAssets).set({modificationsRemaining:sql`${creativeAssets.modificationsRemaining} - 1`}).where(and(eq(creativeAssets.id,input.rootAssetId),eq(creativeAssets.tenantId,input.tenantId),or(sql`${creativeAssets.modificationsRemaining} is null`,sql`${creativeAssets.modificationsRemaining} > 0`))).returning({id:creativeAssets.id});
      if (!root) return 'quota';
      await tx.insert(workflowJobs).values({id:input.id,tenantId:input.tenantId,workflow:'studio-video',status:'awaiting_images',lockKey:`studio-video:${input.tenantId}:${input.id}`,currentStage:'preparing',metadata:{rootAssetId:input.rootAssetId}});
      return 'created';
    });
  }

  async activateVideoAdjustment(id: string, tenantId: string, metadata: unknown): Promise<boolean> {
    const [row] = await this.db.update(workflowJobs).set({status:'pending',currentStage:'queued',metadata:metadata as any,updatedAt:new Date()})
      .where(and(eq(workflowJobs.id,id),eq(workflowJobs.tenantId,tenantId),eq(workflowJobs.workflow,'studio-video'),eq(workflowJobs.status,'awaiting_images'))).returning({id:workflowJobs.id});
    return Boolean(row);
  }

  async cancelVideoAdjustment(id: string, tenantId: string, staleOnly = false): Promise<boolean> {
    return this.db.transaction(async tx => {
      const conditions = [eq(workflowJobs.id,id),eq(workflowJobs.tenantId,tenantId),eq(workflowJobs.workflow,'studio-video'),inArray(workflowJobs.status,staleOnly ? ['awaiting_images'] : ['awaiting_images','pending'])];
      if (staleOnly) conditions.push(lt(workflowJobs.updatedAt,new Date(Date.now()-10*60_000)));
      const [job] = await tx.select().from(workflowJobs).where(and(...conditions)).for('update');
      if (!job) return false;
      const rootId=(job.metadata as {rootAssetId?:string}|null)?.rootAssetId;
      if (!rootId) throw new Error('Raiz do vídeo não encontrada');
      const [root]=await tx.update(creativeAssets).set({modificationsRemaining:sql`${creativeAssets.modificationsRemaining} + 1`}).where(and(eq(creativeAssets.id,rootId),eq(creativeAssets.tenantId,tenantId))).returning({id:creativeAssets.id});
      if (!root) throw new Error('Raiz do vídeo não encontrada');
      await tx.update(workflowJobs).set({status:'error',error:'A preparação do vídeo foi interrompida.',updatedAt:new Date()}).where(eq(workflowJobs.id,id));
      return true;
    });
  }

  async reconcileVideoAdjustments(): Promise<number> {
    const jobs=await this.db.select({id:workflowJobs.id,tenantId:workflowJobs.tenantId}).from(workflowJobs).where(and(eq(workflowJobs.workflow,'studio-video'),eq(workflowJobs.status,'awaiting_images'),lt(workflowJobs.updatedAt,new Date(Date.now()-10*60_000))));
    let count=0;
    for (const job of jobs) {
      try { if (await this.cancelVideoAdjustment(job.id,job.tenantId,true)) count++; }
      catch { console.error('[studio-video] falha ao conciliar reserva de vídeo'); }
    }
    return count;
  }

  async markPendingVideoEnqueueFailed(id: string, tenantId: string): Promise<boolean> {
    const [row] = await this.db.update(workflowJobs)
      .set({ status: 'error', error: 'Não foi possível iniciar a geração.', updatedAt: new Date() })
      .where(and(eq(workflowJobs.id, id), eq(workflowJobs.tenantId, tenantId), eq(workflowJobs.workflow, 'studio-video'), eq(workflowJobs.status, 'pending')))
      .returning({ id: workflowJobs.id });
    return Boolean(row);
  }

  async markUnsubmittedVideoFailed(id: string) {
    return this.db.transaction(async tx => {
      const [job] = await tx.select().from(workflowJobs).where(and(eq(workflowJobs.id,id),eq(workflowJobs.workflow,'studio-video'),eq(workflowJobs.status,'running'),sql`nullif(${workflowJobs.metadata}->>'openrouterJobId', '') is null`)).for('update');
      if (!job) return null;
      const beforeSubmit = job.currentStage === 'queued';
      const metadata = {...(job.metadata as Record<string,unknown>)};
      if (beforeSubmit && typeof metadata.rootAssetId === 'string') {
        const [root] = await tx.update(creativeAssets).set({modificationsRemaining:sql`${creativeAssets.modificationsRemaining} + 1`})
          .where(and(eq(creativeAssets.id,metadata.rootAssetId),eq(creativeAssets.tenantId,job.tenantId))).returning({id:creativeAssets.id});
        if (!root) throw new Error('Raiz do vídeo não encontrada');
      }
      if (!beforeSubmit) metadata.billingUncertain = true;
      const [row] = await tx.update(workflowJobs).set({status:'error',error:beforeSubmit ? 'A geração do vídeo foi interrompida. Tente novamente.' : 'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.',metadata,updatedAt:new Date()}).where(eq(workflowJobs.id,id)).returning();
      return row;
    });
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
    approvalId?: string,
  ): Promise<'created' | 'active_limit' | 'period_limit' | 'approval_inactive'> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${data.tenantId}:${data.workflow}`}))`);
      if (approvalId) {
        // Serialize with stale-approval reconciliation before persisting a paid job.
        const approved = await tx.execute(sql`SELECT id FROM chat_approvals
          WHERE id=${approvalId}::uuid AND tenant_id=${data.tenantId}::uuid AND status='executing' FOR UPDATE`);
        if (!approved.length || data.id !== approvalId) return 'approval_inactive';
      }
      const [row] = await tx
        .select({ n: count() })
        .from(workflowJobs)
        .where(
          and(
            eq(workflowJobs.tenantId, data.tenantId),
            eq(workflowJobs.workflow, data.workflow),
            inArray(workflowJobs.status, ['pending', 'running', 'awaiting_images']),
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
          or(
            inArray(workflowJobs.status, ['pending', 'running', 'done']),
            and(eq(workflowJobs.status, 'error'), sql`${workflowJobs.metadata}->>'billingUncertain' = 'true'`),
          ),
          gte(workflowJobs.createdAt, since),
          sql`${workflowJobs.metadata}->>'rootAssetId' is null`,
        ),
      );
    return Number(row?.n ?? 0);
  }
}
