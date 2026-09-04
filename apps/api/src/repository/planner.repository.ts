import {
  db as defaultDb,
  type Database,
  campaignPlans,
  socialPosts,
  metaConnections,
  creativeAssets,
} from '@fury/db';
import { and, desc, eq, gte, gt, inArray, isNull, lt, lte, not, or, sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';

type CampaignPlan = typeof campaignPlans.$inferSelect;
type SocialPost = typeof socialPosts.$inferSelect;

/**
 * Repositório do domínio **Planner / Calendário Editorial**.
 * Agregado: `socialPosts` + `campaignPlans`. ADR-0001.
 *
 * Todo método é escopado pelo `tenantId` do construtor.
 */
export class PlannerRepository extends TenantScopedRepository {
  constructor(tenantId: string, db: Database = defaultDb) {
    super(tenantId, db);
  }

  // ── Conexão Meta (variantes do planner) ─────────────────────────────

  /** Conexão Meta ativa (token não expirado) — usada em getPrerequisites. */
  async findActiveMetaConnection() {
    return this.db.query.metaConnections.findFirst({
      where: and(
        eq(metaConnections.tenantId, this.tenantId),
        or(gt(metaConnections.tokenExpiresAt, new Date()), isNull(metaConnections.tokenExpiresAt)),
      ),
    });
  }

  // ── Planos de campanha ─────────────────────────────────────────────

  async getPlanById(planId: string) {
    return this.db.query.campaignPlans.findFirst({
      where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, this.tenantId)),
      with: { posts: true },
    });
  }

  async getLatestPlan() {
    return this.db.query.campaignPlans.findFirst({
      where: eq(campaignPlans.tenantId, this.tenantId),
      orderBy: [desc(campaignPlans.createdAt)],
      with: { posts: true },
    });
  }

  /** Lista os planos do tenant (histórico do planejador), mais recente primeiro, com contagem de posts. */
  async listPlans(limit = 10): Promise<Array<CampaignPlan & { postCount: number }>> {
    const plans = await this.db.query.campaignPlans.findMany({
      where: eq(campaignPlans.tenantId, this.tenantId),
      orderBy: [desc(campaignPlans.createdAt)],
      limit,
    });
    if (plans.length === 0) return [];

    const ids = plans.map((p) => p.id);
    const counts = await this.db
      .select({ planId: socialPosts.planId, total: sql<number>`count(*)::int`.mapWith(Number) })
      .from(socialPosts)
      .where(inArray(socialPosts.planId, ids))
      .groupBy(socialPosts.planId);
    const countByPlan = new Map(counts.map((c) => [c.planId, c.total]));

    return plans.map((p) => ({ ...p, postCount: countByPlan.get(p.id) ?? 0 }));
  }

  /** Marca o plano como `active` e aprova os posts dele. Retorna o plano atualizado ou null. */
  async confirmPlan(planId: string): Promise<CampaignPlan | null> {
    const [plan] = await this.db
      .update(campaignPlans)
      .set({ status: 'active' })
      .where(and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, this.tenantId)))
      .returning();
    if (plan) {
      await this.db.update(socialPosts).set({ status: 'approved' }).where(eq(socialPosts.planId, planId));
    }
    return plan ?? null;
  }

  /** Atualiza o metadata de um plano. Retorna o plano atualizado ou null. */
  async revalidatePlan(planId: string, metadata: Record<string, any>) {
    const [updated] = await this.db
      .update(campaignPlans)
      .set({ metadata: metadata as any })
      .where(and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, this.tenantId)))
      .returning();
    return updated ?? null;
  }

  // ── Posts ──────────────────────────────────────────────────────────

  async findPostById(postId: string) {
    return this.db.query.socialPosts.findFirst({
      where: and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, this.tenantId)),
    });
  }

  /** Post de um plano pela chave (planId, calendarDate, postType) — idempotência do fluxo planner→studio. */
  async findPostByPlanDateType(planId: string, calendarDate: string, postType: string) {
    return this.db.query.socialPosts.findFirst({
      where: and(
        eq(socialPosts.planId, planId),
        eq(socialPosts.tenantId, this.tenantId),
        eq(socialPosts.calendarDate, calendarDate),
        eq(socialPosts.postType, postType as any),
      ),
    });
  }

  /** Atualiza campos arbitrários de um post por id (já escopado por tenant). */
  async patchPost(postId: string, setData: Record<string, any>) {
    const [updated] = await this.db
      .update(socialPosts)
      .set(setData)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, this.tenantId)))
      .returning();
    return updated ?? null;
  }

  async listPostsByDateRange(startDate: string, endDate: string) {
    return this.db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.tenantId, this.tenantId),
        gte(socialPosts.calendarDate, startDate),
        lt(socialPosts.calendarDate, endDate),
        not(inArray(socialPosts.status, ['rejected', 'failed'])),
      ),
      with: { plan: true },
    });
  }

  async bulkSchedulePosts(postIds: string[], scheduledAt: string | null) {
    return this.db
      .update(socialPosts)
      .set({
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? 'approved' : 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(socialPosts.tenantId, this.tenantId), inArray(socialPosts.id, postIds)))
      .returning();
  }

  /** Marca posts como `rejected` (delete lógico em lote). */
  async bulkRejectPosts(postIds: string[]) {
    const uuidValues = postIds.map((id) => sql`${id}::uuid`);
    const rows = await this.db
      .update(socialPosts)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(
        and(
          eq(socialPosts.tenantId, this.tenantId),
          sql`${socialPosts.id} IN (${sql.join(uuidValues, sql`, `)})`,
        ),
      )
      .returning();
    return rows;
  }

  async createPost(data: Partial<SocialPost> & {
    tenantId: string;
    postType: string;
    dayIndex: number;
    calendarDate: string;
  }) {
    const [post] = await this.db.insert(socialPosts).values(data as any).returning();
    return post;
  }

  /** Post do planner cuja imagem é exatamente esta URL (auto-ajuste de compliance). */
  async findPostByImageUrl(url: string | null | undefined) {
    if (!url) return null;
    return this.db.query.socialPosts.findFirst({
      where: and(eq(socialPosts.imageUrl, url), eq(socialPosts.tenantId, this.tenantId)),
    });
  }

  /** Atualiza a imagem de um post (usado no auto-ajuste de compliance). */
  async updatePostImage(postId: string, imageUrl: string) {
    await this.db
      .update(socialPosts)
      .set({ imageUrl, imageUrls: [imageUrl] })
      .where(eq(socialPosts.id, postId));
  }

  /** Assets cuja URL casa com as URLs informadas (enriquecimento de compliance por post). */
  async findAssetsByUrls(urls: string[]): Promise<Array<{
    url: string;
    complianceStatus: string | null;
    complianceNotes: string | null;
  }>> {
    if (urls.length === 0) return [];
    return this.db
      .select({
        url: creativeAssets.url,
        complianceStatus: creativeAssets.complianceStatus,
        complianceNotes: creativeAssets.complianceNotes,
      })
      .from(creativeAssets)
      .where(inArray(creativeAssets.url, urls));
  }

  // ── Publicação automática ──────────────────────────────────────────

  async listDuePosts(now: Date) {
    return this.db.query.socialPosts.findMany({
      where: and(
        eq(socialPosts.tenantId, this.tenantId),
        sql`${socialPosts.scheduledAt} IS NOT NULL`,
        sql`${socialPosts.scheduledAt} <= ${now.toISOString()}::timestamptz`,
        eq(socialPosts.status, 'approved'),
        or(isNull(socialPosts.nextRetryAt), lte(socialPosts.nextRetryAt, now)),
      ),
    });
  }

  async markPostPublished(postId: string, publishedAt: Date, platformPostId: string, attempts: number) {
    await this.db
      .update(socialPosts)
      .set({
        status: 'published',
        publishedAt,
        platformPostId,
        publishAttempts: attempts,
        lastPublishError: null,
        nextRetryAt: null,
        updatedAt: publishedAt,
      })
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, this.tenantId)));
  }

  async markPostFailed(postId: string, attempts: number, errorMsg: string, at: Date) {
    await this.db
      .update(socialPosts)
      .set({
        status: 'failed',
        publishAttempts: attempts,
        lastPublishError: errorMsg,
        nextRetryAt: null,
        updatedAt: at,
      })
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, this.tenantId)));
  }

  async setPostRetry(postId: string, attempts: number, errorMsg: string, nextRetryAt: Date, at: Date) {
    await this.db
      .update(socialPosts)
      .set({
        publishAttempts: attempts,
        lastPublishError: errorMsg,
        nextRetryAt,
        updatedAt: at,
      })
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, this.tenantId)));
  }

  // ── Limpeza (reset de job stale) ────────────────────────────────────

  /** Remove todos os posts e planos do tenant (usado no reset de job stale). */
  async clearPlannerData() {
    await this.db.delete(socialPosts).where(eq(socialPosts.tenantId, this.tenantId));
    await this.db.delete(campaignPlans).where(eq(campaignPlans.tenantId, this.tenantId));
  }

  // ── Contagens / chaves (planner-studio) ────────────────────────────

  async countPostsByPlan(planId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql`count(*)::int` })
      .from(socialPosts)
      .where(and(eq(socialPosts.planId, planId), eq(socialPosts.tenantId, this.tenantId)));
    return Number((rows[0] as any)?.total ?? 0);
  }

  /** Chaves `calendarDate:postType` dos posts já criados de um plano (idempotência). */
  async listPostKeysByPlan(planId: string) {
    const rows = await this.db.query.socialPosts.findMany({
      where: and(eq(socialPosts.planId, planId), eq(socialPosts.tenantId, this.tenantId)),
      columns: { calendarDate: true, postType: true },
    });
    return rows.map((r) => `${r.calendarDate}:${r.postType}`);
  }
}