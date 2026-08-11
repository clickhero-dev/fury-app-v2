import { db, campaignPlans, socialPosts, metaConnections, clientGoals, brandKits } from '@fury/db';
import { eq, and, desc, gt, inArray, isNull, or, lte, sql } from 'drizzle-orm';
import { jobs, generateId, runPipeline } from '../agents/orchestrator.js';
import { openrouterService } from './openrouter.service.js';
import type { JobStatus } from '../agents/types.js';
import { parseAgentJSON } from '../agents/utils.js';
import { AppError } from '../middleware/errorHandler.js';
import { createInstagramMedia, getMediaContainerStatus, publishInstagramMedia, getUserFacebookPages } from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';

export { jobs } from '../agents/orchestrator.js';

export function startPlanGeneration(tenantId: string): JobStatus {
  // Lock: rejeita se tenant já tiver um job rodando
  const existing = Array.from(jobs.values()).find(
    j => j.tenantId === tenantId && (j.status === 'running' || j.status === 'generating' || j.status === 'pending'),
  );
  if (existing) throw new AppError(409, 'CONFLICT', 'Já existe um planejamento em andamento');

  const id = generateId();
  const status: JobStatus = {
    id,
    tenantId,
    status: 'running',
    currentAgent: 'Context Agent',
    agentProgress: [{ name: 'Context Agent', status: 'running', pct: 5 }],
  };
  jobs.set(id, status as any);

  runPipeline(tenantId, id).catch(() => {
    const j = jobs.get(id);
    if (j) {
      j.status = 'error';
      j.error = j.error || 'Pipeline error';
    }
  });

  return jobs.get(id) as JobStatus;
}

export function getJobProgress(jobId: string): JobStatus | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  return job as JobStatus;
}

export async function getPlanById(planId: string, tenantId: string) {
  return db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
    with: { posts: true },
  });
}

export async function getLatestPlanByTenant(tenantId: string) {
  return db.query.campaignPlans.findFirst({
    where: eq(campaignPlans.tenantId, tenantId),
    orderBy: [desc(campaignPlans.createdAt)],
    with: { posts: true },
  });
}

export async function getPrerequisites(tenantId: string) {
  const meta = await db.query.metaConnections.findFirst({
    where: and(
      eq(metaConnections.tenantId, tenantId),
      or(gt(metaConnections.tokenExpiresAt, new Date()), isNull(metaConnections.tokenExpiresAt)),
      sql`coalesce(${metaConnections.selectedPageIds}, '[]'::jsonb) != '[]'::jsonb`,
    ),
  });
  const goals = await db.query.clientGoals.findFirst({
    where: eq(clientGoals.tenantId, tenantId),
  });
  const brand = await db.query.brandKits.findFirst({
    where: eq(brandKits.tenantId, tenantId),
  });

  return {
    metaConnected: !!meta,
    hasProduct: !!(goals?.mainProduct),
    hasObjective: !!(goals?.objective),
    hasVoiceTone: !!(brand?.voiceTone),
  };
}

export async function confirmPlan(planId: string, tenantId: string) {
  const [plan] = await db.update(campaignPlans)
    .set({ status: 'active' })
    .where(and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)))
    .returning();
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
  await db.update(socialPosts)
    .set({ status: 'approved' })
    .where(eq(socialPosts.planId, planId));
  return plan;
}

export async function revalidatePlan(planId: string, tenantId: string, updates: Record<string, any>) {
  const plan = await db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
  });
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
  const currentMeta = (plan.metadata || {}) as Record<string, any>;
  const newMeta = { ...currentMeta, ...updates, revalidatedAt: new Date().toISOString() };
  const [updated] = await db.update(campaignPlans)
    .set({ metadata: newMeta as any })
    .where(eq(campaignPlans.id, planId))
    .returning();
  return updated;
}

export async function editPostWithAI(postId: string, tenantId: string, prompt: string) {
  const post = await db.query.socialPosts.findFirst({
    where: and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)),
  });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');

  const systemPrompt = `Você é um copywriter sênior de redes sociais. Edite o post abaixo seguindo EXATAMENTE a instrução do usuário. Mantenha o tom de voz profissional e adequado para negócios locais.

Post atual:
Título: ${post.title ?? '—'}
Legenda: ${post.caption ?? '—'}
CTA: ${post.cta ?? '—'}
Hashtags: ${JSON.stringify(post.hashtags ?? [])}

Instrução do usuário: ${prompt}

Retorne APENAS JSON neste formato exato (sem markdown, sem comentários):
{"caption": "...nova legenda...", "cta": "...novo cta...", "hashtags": ["#tag1", "#tag2"]}`;

  const raw = await openrouterService.chat(
    [{ role: 'system', content: systemPrompt }],
    { temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } },
  );

  let updates: Record<string, any>;
  try {
    updates = parseAgentJSON(raw);
  } catch {
    throw new AppError(502, 'AI_PARSE_ERROR', 'Resposta da IA inválida ao editar post');
  }

  const [updated] = await db.update(socialPosts)
    .set({
      caption: typeof updates.caption === 'string' ? updates.caption : post.caption,
      cta: typeof updates.cta === 'string' ? updates.cta : post.cta,
      hashtags: Array.isArray(updates.hashtags) ? updates.hashtags : post.hashtags,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();

  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
  return updated;
}

export async function updatePostFields(
  postId: string,
  tenantId: string,
  fields: { caption?: string; cta?: string; hashtags?: string[]; imageUrl?: string; scheduledAt?: string | null },
) {
  const setData: Record<string, any> = { updatedAt: new Date() };
  if (fields.caption !== undefined) setData.caption = fields.caption;
  if (fields.cta !== undefined) setData.cta = fields.cta;
  if (fields.hashtags !== undefined) setData.hashtags = fields.hashtags;
  if (fields.imageUrl !== undefined) setData.imageUrl = fields.imageUrl;
  if (fields.scheduledAt !== undefined) setData.scheduledAt = fields.scheduledAt ? new Date(fields.scheduledAt) : null;

  const [updated] = await db.update(socialPosts)
    .set(setData)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
  return updated;
}

// ===== Calendário Editorial =====

export async function getCalendarPosts(tenantId: string, year: number, month: number) {
  // ponytail: traz todos os posts do tenant, frontend filtra por mês
  // Posts de plano: month vem do campaignPlans.periodStart
  // Posts manuais: month vem do scheduledAt
  const plans = await db.query.campaignPlans.findMany({
    where: eq(campaignPlans.tenantId, tenantId),
    with: { posts: true },
  });

  const manualPosts = await db.query.socialPosts.findMany({
    where: and(
      eq(socialPosts.tenantId, tenantId),
      isNull(socialPosts.planId),
    ),
  });

  // Computa month pra cada post
  const allPosts: Array<Record<string, any>> = [];

  for (const plan of plans) {
    if (!plan.periodStart) continue;
    const planMonth = plan.periodStart.getMonth() + 1;
    const planYear = plan.periodStart.getFullYear();
    if (planYear !== year || planMonth !== month) continue;

    for (const post of plan.posts) {
      if (post.status === 'rejected' || post.status === 'failed') continue;
      allPosts.push({ ...post, _source: 'plan', _planTitle: plan.title });
    }
  }

  for (const post of manualPosts) {
    if (post.status === 'rejected' || post.status === 'failed') continue;
    const refDate = post.scheduledAt || post.createdAt;
    if (!refDate) continue;
    const postMonth = refDate.getMonth() + 1;
    const postYear = refDate.getFullYear();
    if (postYear !== year || postMonth !== month) continue;
    allPosts.push({ ...post, _source: 'manual' });
  }

  return allPosts;
}

export async function bulkSchedulePosts(tenantId: string, postIds: string[], scheduledAt: string | null) {
  const result = await db.update(socialPosts)
    .set({
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? 'approved' : 'draft',
      updatedAt: new Date(),
    })
    .where(and(
      eq(socialPosts.tenantId, tenantId),
      inArray(socialPosts.id, postIds),
    ))
    .returning();
  return result;
}

export async function bulkDeletePosts(tenantId: string, postIds: string[]) {
  const result = await db.update(socialPosts)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(and(
      eq(socialPosts.tenantId, tenantId),
      inArray(socialPosts.id, postIds),
    ))
    .returning();
  return result;
}

export async function createManualPost(tenantId: string, data: {
  caption?: string;
  postType: string;
  dayIndex: number;
  platform?: string;
  scheduledAt?: string;
  title?: string;
  imageUrl?: string;
}) {
  const [post] = await db.insert(socialPosts)
    .values({
      tenantId,
      planId: null,
      caption: data.caption || '',
      postType: data.postType as any,
      dayIndex: data.dayIndex,
      platform: data.platform || 'instagram',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      title: data.title || null,
      imageUrl: data.imageUrl || null,
      status: 'approved',
    })
    .returning();
  return post;
}

export async function movePostDay(tenantId: string, postId: string, dayIndex: number) {
  const [updated] = await db.update(socialPosts)
    .set({ dayIndex, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');
  return updated;
}

// ===== Calendário Editorial: Publicação Automática =====

const RETRY_BACKOFF_MINUTES = [1, 5, 15];

interface InstagramAccount {
  igUserId: string;
  accessToken: string;
}

/** Resolve a conta Instagram do tenant pela primeira página com IG no selectedPageIds */
export async function resolveInstagramAccount(tenantId: string): Promise<InstagramAccount | null> {
  const conn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!conn || !conn.accessToken) return null;

  const accessToken = decryptMetaToken(conn.accessToken);
  const selectedPageIds: string[] = (conn.selectedPageIds as any[]) || [];

  if (selectedPageIds.length === 0) return null;

  const pages = await getUserFacebookPages(accessToken);
  const selectedPage = pages.find(
    (p) => selectedPageIds.includes(p.pageId) && p.instagramUserId,
  );

  if (!selectedPage?.instagramUserId) return null;

  return { igUserId: selectedPage.instagramUserId, accessToken };
}

/**
 * Publica um post no Instagram. Função pura — recebe tudo por parâmetro.
 * Testável isoladamente com mock de metaApiCall.
 */
export async function publishSinglePost(
  post: { id: string; postType: string; caption?: string | null; imageUrl?: string | null },
  igUserId: string,
  accessToken: string,
): Promise<{ mediaId: string }> {
  const isReel = post.postType === 'reel';
  const mediaUrl = post.imageUrl;
  if (!mediaUrl) {
    throw new Error(`Post ${post.id} não tem imageUrl para publicar`);
  }

  // 1. Criar media container
  const containerId = await createInstagramMedia(igUserId, accessToken, {
    [isReel ? 'videoUrl' : 'imageUrl']: mediaUrl,
    caption: post.caption || undefined,
    mediaType: isReel ? 'REELS' : undefined,
  });

  // 2. Se vídeo: polling até FINISHED (3 tentativas, backoff 3s/6s/12s)
  if (isReel) {
    const pollDelays = [3_000, 6_000, 12_000];
    for (let i = 0; i < pollDelays.length; i++) {
      await new Promise((r) => setTimeout(r, pollDelays[i]));
      const status = await getMediaContainerStatus(containerId, accessToken);
      if (status === 'FINISHED') break;
      if (i === pollDelays.length - 1) {
        throw new Error(`Video container ${containerId} still IN_PROGRESS after ${pollDelays.length} polls`);
      }
    }
  }

  // 3. Publicar
  const mediaId = await publishInstagramMedia(igUserId, accessToken, containerId);
  return { mediaId };
}

export async function publishDuePosts(tenantId: string) {
  const account = await resolveInstagramAccount(tenantId);

  // Tenant sem Instagram: sai silenciosamente
  if (!account) return { published: 0, posts: [] };

  const now = new Date();

  const due = await db.query.socialPosts.findMany({
    where: and(
      eq(socialPosts.tenantId, tenantId),
      sql`${socialPosts.scheduledAt} IS NOT NULL`,
      sql`${socialPosts.scheduledAt} <= ${now.toISOString()}::timestamptz`,
      eq(socialPosts.status, 'approved'),
      // Respeita backoff: nextRetryAt nulo OU já passou
      or(
        isNull(socialPosts.nextRetryAt),
        lte(socialPosts.nextRetryAt, now),
      ),
    ),
  });

  if (due.length === 0) return { published: 0, posts: [] };

  let published = 0;

  for (const post of due) {
    // ponytail: só image e reel são suportados no Instagram v1
    if (post.postType !== 'image' && post.postType !== 'reel') continue;

    const attempts = (post.publishAttempts ?? 0) + 1;

    try {
      const { mediaId } = await publishSinglePost(
        { id: post.id, postType: post.postType, caption: post.caption, imageUrl: post.imageUrl },
        account.igUserId,
        account.accessToken,
      );

      await db.update(socialPosts)
        .set({
          status: 'published',
          publishedAt: now,
          platformPostId: mediaId,
          publishAttempts: attempts,
          lastPublishError: null,
          nextRetryAt: null,
          updatedAt: now,
        })
        .where(eq(socialPosts.id, post.id));

      published++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[publishDuePosts] Post ${post.id} falhou (tentativa ${attempts}):`, errorMsg);

      if (attempts >= 3) {
        await db.update(socialPosts)
          .set({
            status: 'failed',
            publishAttempts: attempts,
            lastPublishError: errorMsg,
            nextRetryAt: null,
            updatedAt: now,
          })
          .where(eq(socialPosts.id, post.id));
      } else {
        const backoffMin = RETRY_BACKOFF_MINUTES[attempts - 1] ?? 15;
        const nextRetryAt = new Date(now.getTime() + backoffMin * 60_000);

        await db.update(socialPosts)
          .set({
            publishAttempts: attempts,
            lastPublishError: errorMsg,
            nextRetryAt,
            updatedAt: now,
          })
          .where(eq(socialPosts.id, post.id));
      }
    }
  }

  return { published, posts: due.map(p => ({ id: p.id, caption: p.caption?.slice(0, 80) })) };
}
