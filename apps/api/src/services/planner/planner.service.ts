import { generateId } from '../../agents/utils.js';
import { openrouterService } from '../llms/openrouter.service.js';
import type { JobStatus } from '../../agents/types.js';
import { parseAgentJSON } from '../../agents/utils.js';
import { AppError } from '../../middleware/errorHandler.js';
import { createInstagramMedia, getMediaContainerStatus, publishInstagramMedia, getUserFacebookPages } from '../../lib/meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { plannerStore } from '../../planner-store.js';
import { enqueuePlanGeneration } from '../../workers/planner.worker.js';
import { snapshotToJobStatus } from '../../agents/job-status-adapter.js';
import { PlannerRepository } from '../../repository/planner.repository.js';

// Job de planejamento em andamento com mais de 15min é considerado "stale":
// o fluxo limpa os dados do banco e permite gerar novamente.
const PLANNER_JOB_STALE_MS = 15 * 60 * 1000;

// ── helpers puros (sem dependência de repo/service) ──────────────────────────

function formatWaitSeconds(seconds: number): string {
  if (seconds >= 60) {
    const min = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${min}min e ${s}s` : `${min}min`;
  }
  return `${seconds}s`;
}

const RETRY_BACKOFF_MINUTES = [1, 5, 15];

interface InstagramAccount {
  igUserId: string;
  accessToken: string;
  pageName: string;
  instagramUsername: string | null;
}

export interface AgentLabel {
  id: string;
  label: string;
}

export interface AgentLabelsResponse {
  order: string[];
  labels: Record<string, string>;
}

/**
 * PlannerService — classe de domínio com DI no construtor (repoFactory + deps).
 *
 * Métodos usam `this.repo(tenantId)` para acessar o PlannerRepository do tenant
 * e `this.deps.*` para os serviços externos (LLM/openrouter). Nenhum repo é
 * instanciado inline: tudo passa pelas factories injetadas.
 *
 * O singleton (plannerService) é usado pelo controller via composition root.
 * As funções de módulo (abaixo) foram preservadas como aliases que delegam ao
 * singleton — necessárias para o worker (publish-due.worker) e testes que
 * importam `publishDuePosts`, `startPlanGeneration`, `publishSinglePost`.
 */
export class PlannerService {
  constructor(
    private readonly repoFactory: (tenantId: string) => PlannerRepository = (t) => new PlannerRepository(t),
    private readonly deps: {
      openrouter: typeof openrouterService;
      createInstagramMedia: typeof createInstagramMedia;
      getMediaContainerStatus: typeof getMediaContainerStatus;
      publishInstagramMedia: typeof publishInstagramMedia;
      getUserFacebookPages: typeof getUserFacebookPages;
    } = {
      openrouter: openrouterService,
      createInstagramMedia,
      getMediaContainerStatus,
      publishInstagramMedia,
      getUserFacebookPages,
    },
  ) {}

  private repo(t: string): PlannerRepository {
    return this.repoFactory(t);
  }

  /** Remove os dados de planejamento (posts e planos) do tenant — usado no reset de job stale. */
  private async clearTenantPlannerData(tenantId: string): Promise<void> {
    await this.repo(tenantId).clearPlannerData();
  }

  async startPlanGeneration(tenantId: string): Promise<JobStatus> {
    // Gate de créditos ANTES de qualquer etapa do pipeline: se não há saldo,
    // para por aqui e devolve 402 ao front — sem criar job, sem enfileirar,
    // sem queimar créditos nas chamadas de LLM dos agentes iniciais.
    await this.deps.openrouter.assertCreditsAvailable();

    // Lock: rejeita se tenant já tiver um job ativo (running/pending)
    const existing = await plannerStore.findActiveByLockKey(tenantId, 'planner-generate');
    if (existing) {
      const elapsed = Date.now() - new Date(existing.updatedAt).getTime();
      if (elapsed < PLANNER_JOB_STALE_MS) {
        const waitSec = Math.max(1, Math.ceil((PLANNER_JOB_STALE_MS - elapsed) / 1000));
        throw new AppError(
          409,
          'PLANNER_JOB_IN_PROGRESS',
          `Já existe um planejamento em andamento. Aguarde ${formatWaitSeconds(waitSec)} antes de tentar novamente.`,
        );
      }
      // Job stale (> 15min): limpa os dados do tenant e libera o lock para regerar.
      await this.clearTenantPlannerData(tenantId);
      await plannerStore.save(existing.id, { status: 'error' });
    }

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
      const { runPlannerWorkflow } = await import('../../planner-workflow-runner.js');
      void runPlannerWorkflow(id, tenantId).catch((pipelineErr) => {
        console.error('[planner] pipeline inline falhou:', pipelineErr);
      });
    }

    const snapshot = await plannerStore.load(id);
    if (!snapshot) throw new AppError(500, 'INTERNAL', 'Falha ao criar job de planejamento');
    return snapshotToJobStatus(snapshot);
  }

  async getJobProgress(jobId: string): Promise<JobStatus | null> {
    const snapshot = await plannerStore.load(jobId);
    if (!snapshot) return null;
    return snapshotToJobStatus(snapshot);
  }

  async getPlanById(planId: string, tenantId: string) {
    return this.repo(tenantId).getPlanById(planId);
  }

  async getLatestPlanByTenant(tenantId: string) {
    return this.repo(tenantId).getLatestPlan();
  }

  async getPrerequisites(tenantId: string) {
    const repo = this.repo(tenantId);
    const meta = await repo.findActiveMetaConnection();
    const goals = await repo.findClientGoal();
    const brand = await repo.findBrandKit();

    return {
      metaConnected: !!meta,
      hasProduct: !!(goals?.mainProduct),
      hasObjective: !!(goals?.objective),
      hasVoiceTone: !!(brand?.voiceTone),
    };
  }

  async confirmPlan(planId: string, tenantId: string) {
    const plan = await this.repo(tenantId).confirmPlan(planId);
    if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
    return plan;
  }

  async revalidatePlan(planId: string, tenantId: string, updates: Record<string, any>) {
    const repo = this.repo(tenantId);
    const plan = await repo.getPlanById(planId);
    if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
    const currentMeta = (plan.metadata || {}) as Record<string, any>;
    const newMeta = { ...currentMeta, ...updates, revalidatedAt: new Date().toISOString() };
    const updated = await repo.revalidatePlan(planId, newMeta);
    return updated;
  }

  async editPostWithAI(postId: string, tenantId: string, prompt: string) {
    const repo = this.repo(tenantId);
    const post = await repo.findPostById(postId);
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

    const raw = await this.deps.openrouter.chat(
      [{ role: 'system', content: systemPrompt }],
      { temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } },
    );

    let updates: Record<string, any>;
    try {
      updates = parseAgentJSON(raw);
    } catch {
      throw new AppError(502, 'AI_PARSE_ERROR', 'Resposta da IA inválida ao editar post');
    }

    const updated = await repo.patchPost(postId, {
      caption: typeof updates.caption === 'string' ? updates.caption : post.caption,
      cta: typeof updates.cta === 'string' ? updates.cta : post.cta,
      hashtags: Array.isArray(updates.hashtags) ? updates.hashtags : post.hashtags,
      updatedAt: new Date(),
    });

    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
    return updated;
  }

  async updatePostFields(
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

    const updated = await this.repo(tenantId).patchPost(postId, setData);
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
    return updated;
  }

  // ===== Calendário Editorial =====

  /**
   * Retorna posts de um range de datas usando calendar_date direto.
   *
   * - Filtra posts onde calendar_date >= startDate AND calendar_date < endDate
   * - Exclui posts com status 'rejected' ou 'failed'
   * - Carrega dados do plano pai (se houver) para preencher _source/_planTitle
   */
  async getCalendarPostsByDateRange(
    tenantId: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<Record<string, any>>> {
    const allPosts = await this.repo(tenantId).listPostsByDateRange(startDate, endDate);

    // Enriquece com metadados
    return allPosts.map(post => ({
      ...post,
      _source: post.planId ? 'plan' : 'manual',
      _planTitle: post.plan?.title ?? null,
    }));
  }

  /** Função antiga (backwards compatibility com queries year/month). Internamente converte para range de datas. */
  async getCalendarPosts(tenantId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    return this.getCalendarPostsByDateRange(tenantId, startDateStr, endDateStr);
  }

  async bulkSchedulePosts(tenantId: string, postIds: string[], scheduledAt: string | null) {
    return this.repo(tenantId).bulkSchedulePosts(postIds, scheduledAt);
  }

  async bulkDeletePosts(tenantId: string, postIds: string[]) {
    console.log(`[bulkDelete] tenant ${tenantId}: ${postIds.length} posts`, postIds);

    try {
      const result = await this.repo(tenantId).bulkRejectPosts(postIds);
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

  async createManualPost(tenantId: string, data: {
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
    let calendarDate: string | null;

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

    return this.repo(tenantId).createPost({
      tenantId,
      planId: null,
      caption: data.caption || '',
      postType: data.postType as any,
      dayIndex: dayIndex || 1,
      calendarDate: calendarDate!,
      platform: data.platform || 'instagram',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      title: data.title || null,
      imageUrl: data.imageUrl || null,
      imageUrls: data.imageUrls ?? null,
      status: 'approved',
    });
  }

  /** Move post por dayIndex (formato legado da Fase 1). Mantém o mês vigente. */
  async movePostDay(tenantId: string, postId: string, dayIndex: number) {
    const repo = this.repo(tenantId);
    const post = await repo.findPostById(postId);
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');

    // Se o post tem calendar_date, extrai mês/ano e aplica novo dayIndex
    let newCalendarDate: string | null;
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

    const updated = await repo.patchPost(postId, { dayIndex, calendarDate: newCalendarDate, updatedAt: new Date() });
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');
    return updated;
  }

  /** Move post por data completa (novo formato, Fase 1). Extrai o dayIndex da data e grava ambos. */
  async movePostDate(
    tenantId: string,
    postId: string,
    date: string,
    scheduledAt?: string,
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

    const updated = await this.repo(tenantId).patchPost(postId, updateData);
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');
    return updated;
  }

  // ===== Calendário Editorial: Publicação Automática =====

  /** Resolve a conta Instagram do tenant. Prioriza páginas selecionadas com IG; senão fallback para qualquer página com IG. */
  async resolveInstagramAccount(tenantId: string): Promise<InstagramAccount | null> {
    const conn = await this.repo(tenantId).findLatestMetaConnection();

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
    const pages = await this.deps.getUserFacebookPages(accessToken);

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
  async publishSinglePost(
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
    const containerId = await this.deps.createInstagramMedia(igUserId, accessToken, {
      [isReel ? 'videoUrl' : 'imageUrl']: mediaUrl,
      caption: post.caption || undefined,
      mediaType: isReel ? 'REELS' : undefined,
    });

    // 2. Se vídeo: polling até FINISHED (3 tentativas, backoff 3s/6s/12s)
    if (isReel) {
      const pollDelays = [3_000, 6_000, 12_000];
      for (let i = 0; i < pollDelays.length; i++) {
        await new Promise((r) => setTimeout(r, pollDelays[i]));
        const status = await this.deps.getMediaContainerStatus(containerId, accessToken);
        if (status === 'FINISHED') break;
        if (i === pollDelays.length - 1) {
          throw new Error(`Video container ${containerId} still IN_PROGRESS after ${pollDelays.length} polls`);
        }
      }
    }

    // 3. Publicar
    const mediaId = await this.deps.publishInstagramMedia(igUserId, accessToken, containerId);
    return { mediaId };
  }

  async publishDuePosts(tenantId: string) {
    const account = await this.resolveInstagramAccount(tenantId);

    // Tenant sem Instagram: sai silenciosamente
    if (!account) {
      console.log(`[publishDuePosts] tenant ${tenantId}: sem conta Instagram — retornando published: 0`);
      return { published: 0, posts: [], reason: 'no_instagram_account' as const };
    }

    const now = new Date();
    const repo = this.repo(tenantId);
    const due = await repo.listDuePosts(now);

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
        const { mediaId } = await this.publishSinglePost(
          { id: post.id, postType: post.postType, caption: post.caption, imageUrl: post.imageUrl },
          account.igUserId,
          account.accessToken,
        );

        await repo.markPostPublished(post.id, now, mediaId, attempts);
        published++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[publishDuePosts] Post ${post.id} falhou (tentativa ${attempts}):`, errorMsg);

        if (attempts >= 3) {
          await repo.markPostFailed(post.id, attempts, errorMsg, now);
        } else {
          const backoffMin = RETRY_BACKOFF_MINUTES[attempts - 1] ?? 15;
          const nextRetryAt = new Date(now.getTime() + backoffMin * 60_000);
          await repo.setPostRetry(post.id, attempts, errorMsg, nextRetryAt, now);
        }
      }
    }

    return { published, posts: due.map(p => ({ id: p.id, caption: p.caption?.slice(0, 80) })), pageName: account.pageName, instagramUsername: account.instagramUsername };
  }

  getAgentLabels(): AgentLabelsResponse {
    const order = [
      'prerequisites',
      'context',
      'planner',
      'image-generation',
      'save',
    ];

    const labels: Record<string, string> = {
      prerequisites: 'Checando pré-requisitos e disponibilidade do gerador',
      context: 'Coletando contexto da sua empresa',
      planner: 'Criando os posts do calendário',
      'image-generation': 'Gerando as imagens dos posts',
      save: 'Salvando no calendário',
    };

    return { order, labels };
  }
}

export const plannerService = new PlannerService();

// ── Aliases de módulo que delegam ao singleton ──────────────────────────────
// Preservados para o worker (publish-due.worker) e testes que importam as
// funções como exports de módulo (publish-due.test, planner-lock.test).
export const startPlanGeneration = (tenantId: string): ReturnType<PlannerService['startPlanGeneration']> =>
  plannerService.startPlanGeneration(tenantId);

export const publishSinglePost: PlannerService['publishSinglePost'] = (post, igUserId, accessToken) =>
  plannerService.publishSinglePost(post, igUserId, accessToken);

export const publishDuePosts: PlannerService['publishDuePosts'] = (tenantId) =>
  plannerService.publishDuePosts(tenantId);