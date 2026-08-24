import { db, campaignPlans, socialPosts, metaConnections, clientGoals, brandKits } from '@fury/db';
import { eq, and, desc, gt, gte, lt, not, inArray, isNull, or, lte, sql } from 'drizzle-orm';
import { generateId } from '../agents/orchestrator.js';
import { openrouterService } from './openrouter.service.js';
import type { JobStatus } from '../agents/types.js';
import { parseAgentJSON } from '../agents/utils.js';
import { AppError } from '../middleware/errorHandler.js';
import { createInstagramMedia, getMediaContainerStatus, publishInstagramMedia, getUserFacebookPages } from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { plannerStore } from '../planner-workflow-runner.js';
import { enqueuePlanGeneration } from '../workers/planner.worker.js';
import { snapshotToJobStatus } from '../agents/job-status-adapter.js';

export async function startPlanGeneration(tenantId: string): Promise<JobStatus> {
  // Lock: rejeita se tenant já tiver um job ativo (running/pending)
  const existing = await plannerStore.findActiveByLockKey(tenantId, 'planner-generate');
  if (existing) throw new AppError(409, 'CONFLICT', 'Já existe um planejamento em andamento');

  const id = generateId();
  await plannerStore.create({
    id,
    tenantId,
    workflow: 'planner-generate',
    lockKey: tenantId,
  });

  try {
    await enqueuePlanGeneration(id, tenantId);
  } catch (err) {
    console.warn('[planner] falha ao enfileirar no BullMQ, executando inline:', err);
    const { runPlannerWorkflow } = await import('../planner-workflow-runner.js');
    void runPlannerWorkflow(id, tenantId).catch((pipelineErr) => {
      console.error('[planner] pipeline inline falhou:', pipelineErr);
    });
  }

  const snapshot = await plannerStore.load(id);
  if (!snapshot) throw new AppError(500, 'INTERNAL', 'Falha ao criar job de planejamento');
  return snapshotToJobStatus(snapshot);
}

export async function getJobProgress(jobId: string): Promise<JobStatus | null> {
  const snapshot = await plannerStore.load(jobId);
  if (!snapshot) return null;
  return snapshotToJobStatus(snapshot);
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
  fields: { caption?: string; cta?: string; hashtags?: string[]; imageUrl?: string; imageUrls?: string[]; scheduledAt?: string | null },
) {
  const setData: Record<string, any> = { updatedAt: new Date() };
  if (fields.caption !== undefined) setData.caption = fields.caption;
  if (fields.cta !== undefined) setData.cta = fields.cta;
  if (fields.hashtags !== undefined) setData.hashtags = fields.hashtags;
  if (fields.imageUrl !== undefined) setData.imageUrl = fields.imageUrl;
  if (fields.imageUrls !== undefined) setData.imageUrls = fields.imageUrls;
  if (fields.scheduledAt !== undefined) setData.scheduledAt = fields.scheduledAt ? new Date(fields.scheduledAt) : null;

  const [updated] = await db.update(socialPosts)
    .set(setData)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
  return updated;
}

// ===== Calendário Editorial =====

/**
 * Função genérica: retorna posts de um range de datas usando calendar_date direto.
 *
 * @param tenantId - ID do tenant
 * @param startDate - ISO string (ex: "2026-08-01")
 * @param endDate - ISO string, exclusivo (ex: "2026-09-01")
 *
 * Lógica (Fase 3 — query direta em calendar_date):
 * - Filtra posts onde calendar_date >= startDate AND calendar_date < endDate
 * - Exclui posts com status 'rejected' ou 'failed'
 * - Carrega dados do plano pai (se houver) para preencher _source/_planTitle
 */
export async function getCalendarPostsByDateRange(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<Array<Record<string, any>>> {
  // Query direta: filtra por calendar_date no range [startDate, endDate)
  const allPosts = await db.query.socialPosts.findMany({
    where: and(
      eq(socialPosts.tenantId, tenantId),
      gte(socialPosts.calendarDate, startDate),
      lt(socialPosts.calendarDate, endDate),
      not(inArray(socialPosts.status, ['rejected', 'failed'])),
    ),
    with: { plan: true }, // Carrega plano pai para _planTitle
  });

  // Enriquece com metadados
  return allPosts.map(post => ({
    ...post,
    _source: post.planId ? 'plan' : 'manual',
    _planTitle: post.plan?.title ?? null,
  }));
}

/**
 * Função antiga (mantida para backwards compatibility com queries year/month).
 * Internamente converte para range de datas e chama getCalendarPostsByDateRange.
 */
export async function getCalendarPosts(tenantId: string, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  return getCalendarPostsByDateRange(tenantId, startDateStr, endDateStr);
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
  console.log(`[bulkDelete] tenant ${tenantId}: ${postIds.length} posts`, postIds);
  
  const uuidValues = postIds.map((id) => sql`${id}::uuid`);
  
  try {
    const result = await db.update(socialPosts)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(
        eq(socialPosts.tenantId, tenantId),
        sql`${socialPosts.id} IN (${sql.join(uuidValues, sql`, `)})`,
      ))
      .returning();
    console.log(`[bulkDelete] tenant ${tenantId}: ${result.length} deletados`);
    return result;
  } catch (err) {
    console.error(`[bulkDelete] tenant ${tenantId} ERROR:`, err);
    if (err instanceof Error) {
      console.error(`[bulkDelete] message:`, err.message);
      console.error(`[bulkDelete] stack:`, err.stack?.split('\n').slice(0, 5).join('\n'));
    }
    throw err;
  }
}

export async function createManualPost(tenantId: string, data: {
  caption?: string;
  postType: string;
  dayIndex?: number;
  date?: string; // ISO date: "2026-08-19" (novo formato, Fase 1)
  platform?: string;
  scheduledAt?: string;
  title?: string;
  imageUrl?: string;
  imageUrls?: string[];
}) {
  // Dual-format: calcula dayIndex e calendarDate a partir de date ou dayIndex
  let dayIndex = data.dayIndex;
  let calendarDate: string | null = null;

  if (data.date) {
    // Novo formato: date completa
    const dateObj = new Date(data.date);
    dayIndex = dateObj.getUTCDate();
    calendarDate = data.date;
  } else if (dayIndex) {
    // Formato antigo: dayIndex — calendarDate usa mês corrente (fallback Fase 2, seção 4, passo 2/3)
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
    const clampedDay = Math.min(dayIndex, lastDayOfMonth);
    const date = new Date(Date.UTC(year, month, clampedDay));
    calendarDate = date.toISOString().split('T')[0];
  } else {
    // Fallback: dia 1 de mês corrente
    const now = new Date();
    dayIndex = 1;
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = new Date(Date.UTC(year, month, 1));
    calendarDate = date.toISOString().split('T')[0];
  }

  const [post] = await db.insert(socialPosts)
    .values({
      tenantId,
      planId: null,
      caption: data.caption || '',
      postType: data.postType as any,
      dayIndex: dayIndex || 1,
      calendarDate,
      platform: data.platform || 'instagram',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      title: data.title || null,
      imageUrl: data.imageUrl || null,
      imageUrls: data.imageUrls ?? null,
      status: 'approved',
    })
    .returning();
  return post;
}

/**
 * Move post por dayIndex (formato legado da Fase 1).
 * Mantém o mês vigente: busca calendar_date atual, troca só o dia, grava resultado.
 * Isso preserva o comportamento "move dentro do mês" para clientes antigos.
 */
export async function movePostDay(tenantId: string, postId: string, dayIndex: number) {
  // Busca o post atual para ter a calendar_date vigente
  const [post] = await db.query.socialPosts.findMany({
    where: and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)),
    limit: 1,
  });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');

  // Se o post tem calendar_date, extrai mês/ano e aplica novo dayIndex
  let newCalendarDate: string | null = null;
  if (post.calendarDate) {
    const currentDate = new Date(post.calendarDate);
    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
    const clampedDay = Math.min(dayIndex, lastDayOfMonth);
    const newDate = new Date(Date.UTC(year, month, clampedDay));
    newCalendarDate = newDate.toISOString().split('T')[0];
  } else {
    // Fallback: nenhuma calendar_date, usar mês corrente
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
    const clampedDay = Math.min(dayIndex, lastDayOfMonth);
    const newDate = new Date(Date.UTC(year, month, clampedDay));
    newCalendarDate = newDate.toISOString().split('T')[0];
  }

  const [updated] = await db.update(socialPosts)
    .set({ dayIndex, calendarDate: newCalendarDate, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');
  return updated;
}

/**
 * Move post por data completa (novo formato, Fase 1).
 * Extrai o dayIndex da data e grava tanto dayIndex quanto calendar_date.
 */
export async function movePostDate(
  tenantId: string, 
  postId: string, 
  date: string, 
  scheduledAt?: string
) {
  const dateObj = new Date(date);
  const dayIndex = dateObj.getUTCDate();
  const calendarDate = date;

  // Monta o objeto de atualização
  const updateData: Record<string, any> = {
    dayIndex,
    calendarDate,
    updatedAt: new Date(),
  };

  // Se um novo scheduledAt (data + hora) foi informado, converte e adiciona
  if (scheduledAt) {
    updateData.scheduledAt = new Date(scheduledAt);
  }

  const [updated] = await db.update(socialPosts)
    .set(updateData)
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
  pageName: string;
  instagramUsername: string | null;
}

/** Resolve a conta Instagram do tenant. Prioriza páginas selecionadas com IG; se nenhuma, faz fallback para qualquer página com IG. */
export async function resolveInstagramAccount(tenantId: string): Promise<InstagramAccount | null> {
  const conn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!conn) {
    console.log(`[resolveInstagram] tenant ${tenantId}: sem conexão Meta`);
    return null;
  }
  if (!conn.accessToken) {
    console.log(`[resolveInstagram] tenant ${tenantId}: conexão Meta sem token`);
    return null;
  }

  const accessToken = decryptMetaToken(conn.accessToken);
  const selectedPageIds: string[] = (conn.selectedPageIds as any[]) || [];
  const pages = await getUserFacebookPages(accessToken);

  console.log(`[resolveInstagram] tenant ${tenantId}: Facebook retornou ${pages.length} páginas:`,
    JSON.stringify(pages.map(p => ({ pageId: p.pageId, name: p.name, hasInstagram: p.hasInstagram, instagramUserId: p.instagramUserId }))));

  const pagesWithIg = pages.filter((p) => p.instagramUserId);
  if (pagesWithIg.length === 0) {
    console.log(`[resolveInstagram] tenant ${tenantId}: nenhuma das ${pages.length} páginas tem Instagram vinculado`);
    return null;
  }

  const buildAccount = (p: typeof pagesWithIg[number], source: string) => {
    console.log(`[resolveInstagram] tenant ${tenantId}: ${source} — "${p.name}" IG=${p.instagramUserId} (@${p.instagramUsername || 'sem @'})`);
    return { igUserId: p.instagramUserId!, accessToken, pageName: p.name, instagramUsername: p.instagramUsername };
  };

  if (selectedPageIds.length > 0) {
    const selected = pagesWithIg.find((p) => selectedPageIds.includes(p.pageId));
    if (selected) return buildAccount(selected, 'selecionada');
  }

  const fallback = pagesWithIg[0];
  console.log(`[resolveInstagram] tenant ${tenantId}: fallback — usando "${fallback.name}"`);
  return buildAccount(fallback, 'fallback');
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
  if (!account) {
    console.log(`[publishDuePosts] tenant ${tenantId}: sem conta Instagram — retornando published: 0`);
    return { published: 0, posts: [], reason: 'no_instagram_account' as const };
  }

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

  if (due.length === 0) {
    console.log(`[publishDuePosts] tenant ${tenantId}: 0 posts elegíveis encontrados`);
    return { published: 0, posts: [], reason: 'no_due_posts' as const, pageName: account.pageName, instagramUsername: account.instagramUsername };
  }

  console.log(`[publishDuePosts] tenant ${tenantId}: ${due.length} posts elegíveis, iniciando publicação...`);
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

  return { published, posts: due.map(p => ({ id: p.id, caption: p.caption?.slice(0, 80) })), pageName: account.pageName, instagramUsername: account.instagramUsername };
}

export interface AgentLabel {
  id: string;
  label: string;
}

export interface AgentLabelsResponse {
  order: string[];
  labels: Record<string, string>;
}

export function getAgentLabels(): AgentLabelsResponse {
  const order = [
    'context',
    'research',
    'analytics',
    'strategy',
    'planner',
    'copywriter',
    'creative',
    'image-generation',
    'quality',
    'scheduler',
    'branding',
    'save',
  ];

  const labels: Record<string, string> = {
    context: 'Coletando contexto do seu negócio',
    research: 'Pesquisando tendências e datas comemorativas',
    analytics: 'Analisando melhores formatos e horários',
    strategy: 'Definindo estratégia e pilares de conteúdo',
    planner: 'Montando calendário de posts',
    copywriter: 'Escrevendo legendas e CTAs',
    creative: 'Criando prompts de imagem',
    'image-generation': 'Gerando imagens dos posts',
    quality: 'Validando qualidade do conteúdo',
    scheduler: 'Programando melhores horários de publicação',
    branding: 'Verificando compliance da marca',
    save: 'Salvando plano no banco',
  };

  return { order, labels };
}
