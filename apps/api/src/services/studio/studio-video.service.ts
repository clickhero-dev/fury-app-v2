import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';
import { StudioRepository } from '../../repository/studio.repository.js';
import { WorkflowJobRepository } from '../../repository/workflow-job.repository.js';
import { BrandKitPhotoRepository } from '../../repository/brand-kit-photo.repository.js';
import { openrouterService } from '../llms/openrouter.service.js';
import { SubscriptionRepository } from '../../repository/subscription.repository.js';
import { openrouterVideoClient, type OpenRouterVideoClient, type VideoSubmitParams } from '../../lib/openrouter-video.js';
import { runWithTenant } from '../../lib/ai-key-context.js';
import { ensureStudioAssetsDir, studioAssetsDir } from '../../lib/temp-storage.js';
import { uploadAsset } from '../storage/storage.service.js';
import { AD_VIDEO_MODELS, DEFAULT_AD_VIDEO_MODEL } from './studio-model-catalog.js';
import { TEMPLATE_ANALYSIS_MODEL } from './template-prompt.js';
import { consumeModificationQuota, refundModificationQuota } from './creative-quota.service.js';

export const VIDEO_WORKFLOW = 'studio-video';
export const VIDEO_SOURCE = 'openrouter-video';
// por enquanto só 15s
export const VIDEO_DURATIONS = [15] as const;
export const VIDEO_ASPECT_RATIOS = ['9:16', '16:9'] as const;
const VIDEO_RESOLUTION = '720p';
const SCRIPT_MODEL = TEMPLATE_ANALYSIS_MODEL;
const MAX_ACTIVE_JOBS_PER_TENANT = 2;
const MAX_PHOTOS = 4;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 10_000;
// sem heartbeat há 10 min = job órfão (worker morreu); não bloqueia o tenant
const STALE_JOB_MS = 10 * 60 * 1000;
// falhas seguidas ao consultar o status antes de desistir
const MAX_STATUS_ERRORS = 6;
// vídeo já pago: tenta baixar/salvar de novo antes de falhar
const SAVE_ATTEMPTS = 3;
const MAX_SCENES = 8;

export type AspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];
export type VideoStage = 'queued' | 'submitting' | 'generating' | 'saving' | 'done';
type PhotoKind = 'produto' | 'equipe';

export interface VideoScene {
  start: number;
  end: number;
  visual: string;
  narration: string;
}

interface VideoPhoto {
  url: string;
  kind: PhotoKind;
}

interface LogEntry {
  at: string;
  step: string;
  detail?: string;
}

interface VideoJobMetadata {
  prompt: string;
  scenes: VideoScene[];
  photos: VideoPhoto[];
  aspectRatio: AspectRatio;
  duration: number;
  model: string;
  videoPrompt: string;
  scriptModel: string;
  scriptCostUsd: number | null;
  videoCostUsd: number | null;
  rootAssetId: string | null;
  feedback: string | null;
  /** Teto de mudanças do plano, congelado no vídeo novo (null = sem limite). */
  modificationsLimit?: number | null;
  openrouterJobId: string | null;
  startedAt: string;
  submittedAt: string | null;
  log: LogEntry[];
}

export interface CreateVideoInput {
  prompt: string;
  scenes: VideoScene[];
  photoIds: string[];
  aspectRatio: AspectRatio;
  duration: number;
}

/** Cota de vídeo do plano: null = sem limite; chave ausente = 0 (vídeo desligado). */
export interface VideoLimits {
  videosPerMonth: number | null;
  modificationsPerVideo: number | null;
  periodStart: Date;
}

export interface VideoJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  stage: VideoStage;
  prompt: string;
  error: string | null;
  assetId: string | null;
  videoUrl: string | null;
  createdAt: string;
}

const PHOTO_ROLE: Record<PhotoKind, string> = {
  produto: 'produto — use EXATAMENTE este produto (mesma forma, cores, rótulo e detalhes)',
  equipe: 'pessoa — mostre esta MESMA pessoa (mesmo rosto, cabelo e tom de pele)',
};

function sumCosts(...costs: Array<number | null | undefined>): number | null {
  const known = costs.filter((c): c is number => typeof c === 'number');
  return known.length ? known.reduce((a, c) => a + c, 0) : null;
}

function formatLabel(aspect: AspectRatio): string {
  return aspect === '9:16' ? 'vertical (9:16)' : 'horizontal (16:9)';
}

function referenceLines(photos: VideoPhoto[]): string {
  return photos.map((p, i) => `imagem ${i + 1} = ${PHOTO_ROLE[p.kind]}`).join('; ');
}

const SCRIPT_RULES = (duration: number) => `Regras:
- 3 a 4 cenas cobrindo exatamente de 0 a ${duration} segundos, em ordem e sem buracos.
- Gancho forte nos 2 primeiros segundos; a última cena termina com uma chamada para ação falada.
- Narração em português do Brasil, natural, que caiba no tempo da cena (cerca de 2,5 palavras por segundo).
- "visual": descreva a cena para um modelo de vídeo (enquadramento, ação, ambiente, luz). Sem textos escritos na tela.
- Não invente preços, descontos nem promessas de resultado garantido.
Responda só com JSON: {"scenes":[{"start":0,"end":4,"visual":"...","narration":"..."}]}`;

/** Lê e valida as cenas devolvidas pelo LLM. */
export function parseScenes(content: string, duration: number): VideoScene[] {
  const match = content.match(/\{[\s\S]*\}/);
  let parsed: any;
  try {
    parsed = JSON.parse(match?.[0] ?? content);
  } catch {
    throw new AppError(502, 'VIDEO_SCRIPT_INVALID', 'Não foi possível montar o roteiro. Tente novamente.');
  }
  const scenes = (Array.isArray(parsed?.scenes) ? parsed.scenes : [])
    .map((s: any) => ({
      start: Math.max(0, Math.min(duration, Number(s?.start) || 0)),
      end: Math.max(0, Math.min(duration, Number(s?.end) || 0)),
      visual: String(s?.visual ?? '').trim(),
      narration: String(s?.narration ?? '').trim(),
    }))
    .filter((s: VideoScene) => s.visual && s.end > s.start)
    // mesmos limites do schema de criação
    .slice(0, MAX_SCENES)
    .map((s: VideoScene) => ({ ...s, visual: s.visual.slice(0, 600), narration: s.narration.slice(0, 400) }));
  if (!scenes.length) throw new AppError(502, 'VIDEO_SCRIPT_INVALID', 'Não foi possível montar o roteiro. Tente novamente.');
  return scenes;
}

/** Prompt final do vídeo: formato, referências e roteiro com tempos. */
export function buildVideoPrompt(input: {
  businessName: string;
  aspectRatio: AspectRatio;
  duration: number;
  photos: VideoPhoto[];
  scenes: VideoScene[];
}): string {
  const lines = [
    `Anúncio em vídeo ${formatLabel(input.aspectRatio)} de ${input.duration} segundos para a marca "${input.businessName}".`,
  ];
  if (input.photos.length) {
    lines.push(`Imagens de referência: ${referenceLines(input.photos)}. Não troque por outro produto ou outra pessoa.`);
  }
  lines.push('Siga este roteiro, na ordem e nos tempos indicados:');
  for (const s of input.scenes) {
    const speech = s.narration ? ` | Narração em português do Brasil: "${s.narration}"` : '';
    lines.push(`[${s.start}s–${s.end}s] Cena: ${s.visual}${speech}`);
  }
  lines.push(
    'Áudio: narração em português do Brasil, voz natural e clara, com trilha de fundo discreta. ' +
      'Visual de anúncio profissional com cortes entre as cenas. Não escreva textos, legendas ou letreiros na tela.',
  );
  return lines.join('\n');
}

function limitValue(limits: Record<string, unknown>, key: string): number | null {
  if (!(key in limits)) return 0;
  const v = limits[key];
  return v === null ? null : Math.max(0, Number(v) || 0);
}

/** Lê a cota de vídeo do plano; o período é o mês da assinatura (mesmo ciclo da cota de fotos). */
export function resolveVideoLimits(
  rawLimits: unknown,
  currentPeriodEnd: Date | null | undefined,
  now: Date,
): VideoLimits {
  const limits = (rawLimits ?? {}) as Record<string, unknown>;
  let periodStart: Date;
  if (currentPeriodEnd) {
    periodStart = new Date(currentPeriodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
  } else {
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return {
    videosPerMonth: limitValue(limits, 'videosPerMonth'),
    modificationsPerVideo: limitValue(limits, 'modificationsPerVideo'),
    periodStart,
  };
}

async function loadVideoLimits(tenantId: string): Promise<VideoLimits> {
  const repo = new SubscriptionRepository(tenantId);
  const sub = await repo.findSubscription();
  // sem assinatura: vídeo desligado
  if (!sub) return { videosPerMonth: 0, modificationsPerVideo: 0, periodStart: new Date() };
  const plan = await repo.findPlanById(sub.planId);
  return resolveVideoLimits(plan?.limits, sub.currentPeriodEnd, new Date());
}

/** Guarda o arquivo no R2 ou, sem R2 configurado, no disco servido em /studio-assets. */
async function storeFile(buffer: Buffer, ext: string, mimeType: string): Promise<string> {
  const fileName = `${randomUUID()}.${ext}`;
  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    return uploadAsset(buffer, `studio-videos/${fileName}`, mimeType);
  }
  await ensureStudioAssetsDir();
  await writeFile(join(studioAssetsDir, fileName), buffer);
  const base = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  return `${base}/studio-assets/${fileName}`;
}

type Llm = Pick<typeof openrouterService, 'chatWithImages' | 'assertCreditsAvailable'>;

type Deps = {
  video: OpenRouterVideoClient;
  llm: Llm;
  studioRepo: (tenantId: string) => StudioRepository;
  photoRepo: (tenantId: string) => BrandKitPhotoRepository;
  jobRepo: WorkflowJobRepository;
  brand: (tenantId: string) => Promise<{ businessName: string; voiceTone?: string }>;
  enqueue: (jobId: string, tenantId: string) => Promise<void>;
  limits: (tenantId: string) => Promise<VideoLimits>;
  modQuota: { consume: (rootAssetId: string) => Promise<void>; refund: (rootAssetId: string) => Promise<void> };
  sleep: (ms: number) => Promise<void>;
  store: typeof storeFile;
  now: () => number;
};

export class StudioVideoService {
  private deps: Deps;

  constructor(deps: Partial<Deps> = {}) {
    const studioRepo = deps.studioRepo ?? ((t: string) => new StudioRepository(t));
    this.deps = {
      video: openrouterVideoClient,
      llm: openrouterService,
      studioRepo,
      photoRepo: (t) => new BrandKitPhotoRepository(t),
      jobRepo: new WorkflowJobRepository(''),
      brand: async (t) => ({ businessName: (await studioRepo(t).findTenant())?.name ?? 'Meu Negócio' }),
      enqueue: async () => {
        throw new Error('enqueue não configurado');
      },
      limits: loadVideoLimits,
      modQuota: { consume: consumeModificationQuota, refund: refundModificationQuota },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      store: storeFile,
      now: () => Date.now(),
      ...deps,
    };
  }

  async getOptions(tenantId: string) {
    const limits = await this.deps.limits(tenantId);
    const used = limits.videosPerMonth
      ? await this.deps.jobRepo.countPeriodJobs(tenantId, VIDEO_WORKFLOW, limits.periodStart)
      : 0;
    return {
      durations: VIDEO_DURATIONS,
      aspectRatios: VIDEO_ASPECT_RATIOS,
      maxPhotos: MAX_PHOTOS,
      // cota 0 = plano sem vídeo (a tela esconde a criação e o filtro)
      enabled: limits.videosPerMonth !== 0,
      videosLimit: limits.videosPerMonth,
      videosRemaining: limits.videosPerMonth === null ? null : Math.max(0, limits.videosPerMonth - used),
    };
  }

  /** Fotos da biblioteca do tenant (produto/equipe), na ordem pedida. */
  private async loadPhotos(tenantId: string, photoIds: string[]): Promise<VideoPhoto[]> {
    if (!photoIds.length) return [];
    if (photoIds.length > MAX_PHOTOS) throw new AppError(400, 'TOO_MANY_PHOTOS', `Use no máximo ${MAX_PHOTOS} fotos.`);
    const rows = await this.deps.photoRepo(tenantId).findByIds(photoIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return photoIds.map((id) => {
      const p = byId.get(id);
      if (!p || p.kind === 'modelo') {
        throw new AppError(400, 'INVALID_REFERENCE_IMAGE', 'Uma ou mais fotos não pertencem à sua biblioteca de produtos/equipe.');
      }
      return { url: p.url, kind: p.kind as PhotoKind };
    });
  }

  private async askScript(text: string, photos: VideoPhoto[], duration: number) {
    const res = await this.deps.llm.chatWithImages({
      model: SCRIPT_MODEL,
      text,
      imageUrls: photos.map((p) => p.url),
      temperature: 0.7,
      jsonMode: true,
    });
    return { scenes: parseScenes(res.content, duration), costUsd: res.costUsd };
  }

  async generateScript(
    tenantId: string,
    input: { prompt: string; photoIds: string[]; aspectRatio: AspectRatio; duration: number },
  ) {
    const photos = await this.loadPhotos(tenantId, input.photoIds);
    const brand = await this.deps.brand(tenantId);
    const text = [
      'Você é roteirista de anúncios em vídeo para redes sociais (Meta Ads).',
      `Escreva o roteiro de um vídeo ${formatLabel(input.aspectRatio)} de ${input.duration} segundos para a marca "${brand.businessName}".`,
      brand.voiceTone ? `Tom de comunicação: ${brand.voiceTone}.` : '',
      `Pedido do cliente: "${input.prompt}"`,
      photos.length ? `Imagens anexadas: ${referenceLines(photos)}. O vídeo deve mostrar exatamente isso.` : '',
      SCRIPT_RULES(input.duration),
    ].filter(Boolean).join('\n');
    const started = this.deps.now();
    const result = await this.askScript(text, photos, input.duration);
    console.log('[studio-video] roteiro gerado', { tenantId, scenes: result.scenes.length, costUsd: result.costUsd, ms: this.deps.now() - started });
    return { scenes: result.scenes };
  }

  async createJob(tenantId: string, input: CreateVideoInput): Promise<{ jobId: string }> {
    if (!(VIDEO_DURATIONS as readonly number[]).includes(input.duration)) {
      throw new AppError(400, 'INVALID_DURATION', 'Duração inválida.');
    }
    const limits = await this.deps.limits(tenantId);
    if (limits.videosPerMonth === 0) {
      throw new AppError(403, 'VIDEO_NOT_IN_PLAN', 'Seu plano não inclui criação de vídeo.');
    }
    const photos = await this.loadPhotos(tenantId, input.photoIds);
    return this.enqueueJob(
      tenantId,
      {
        prompt: input.prompt,
        scenes: input.scenes,
        photos,
        aspectRatio: input.aspectRatio,
        duration: input.duration,
        model: DEFAULT_AD_VIDEO_MODEL,
        scriptCostUsd: null,
        rootAssetId: null,
        feedback: null,
        modificationsLimit: limits.modificationsPerVideo,
      },
      limits.videosPerMonth === null ? undefined : { since: limits.periodStart, limit: limits.videosPerMonth },
    );
  }

  /** Ajuste pós-geração: o LLM reescreve o roteiro com o pedido e gera uma nova versão do grupo. */
  async adjustVideo(tenantId: string, assetId: string, feedback: string): Promise<{ jobId: string }> {
    const asset = await this.deps.studioRepo(tenantId).findAssetById(assetId);
    if (!asset || asset.type !== 'video') throw new AppError(404, 'VIDEO_NOT_FOUND', 'Vídeo não encontrado.');
    let notes: any;
    try {
      notes = JSON.parse(asset.complianceNotes ?? '{}');
    } catch {
      notes = {};
    }
    if (notes?.source !== VIDEO_SOURCE || !Array.isArray(notes.scenes)) {
      throw new AppError(400, 'VIDEO_NOT_ADJUSTABLE', 'Este vídeo não pode ser ajustado.');
    }
    const photos = (notes.photos ?? []) as VideoPhoto[];
    const duration = Number(notes.durationSeconds) || VIDEO_DURATIONS[0];
    if ((await this.deps.limits(tenantId)).videosPerMonth === 0) {
      throw new AppError(403, 'VIDEO_NOT_IN_PLAN', 'Seu plano não inclui criação de vídeo.');
    }
    const rootAssetId = asset.rootAssetId ?? asset.id;
    // mudanças por vídeo, como nas imagens; devolve se não chegar a gerar
    await this.deps.modQuota.consume(rootAssetId);
    try {
      const text = [
        'Você é roteirista de anúncios em vídeo para redes sociais (Meta Ads).',
        'Ajuste o roteiro abaixo conforme o pedido do cliente. Mude só o que foi pedido e mantenha o resto.',
        `Roteiro atual: ${JSON.stringify({ scenes: notes.scenes })}`,
        `Pedido de ajuste: "${feedback}"`,
        SCRIPT_RULES(duration),
      ].join('\n');
      const result = await this.askScript(text, photos, duration);
      console.log('[studio-video] roteiro ajustado', { tenantId, assetId, costUsd: result.costUsd });
      return await this.enqueueJob(tenantId, {
        prompt: notes.prompt ?? '',
        scenes: result.scenes,
        photos,
        aspectRatio: notes.aspectRatio === '16:9' ? '16:9' : '9:16',
        duration,
        model: AD_VIDEO_MODELS.some((m) => m.id === notes.model) ? notes.model : DEFAULT_AD_VIDEO_MODEL,
        scriptCostUsd: result.costUsd,
        rootAssetId,
        feedback,
      });
    } catch (err) {
      await this.deps.modQuota.refund(rootAssetId);
      throw err;
    }
  }

  private async enqueueJob(
    tenantId: string,
    input: Omit<VideoJobMetadata, 'videoPrompt' | 'scriptModel' | 'videoCostUsd' | 'openrouterJobId' | 'startedAt' | 'submittedAt' | 'log'>,
    period?: { since: Date; limit: number },
  ): Promise<{ jobId: string }> {
    const brand = await this.deps.brand(tenantId);
    const jobId = randomUUID();
    const at = new Date(this.deps.now()).toISOString();
    const metadata: VideoJobMetadata = {
      ...input,
      videoPrompt: buildVideoPrompt({ businessName: brand.businessName, ...input }),
      scriptModel: SCRIPT_MODEL,
      videoCostUsd: null,
      openrouterJobId: null,
      startedAt: at,
      submittedAt: null,
      log: [
        { at, step: 'roteiro', detail: `${input.scenes.length} cenas · custo ${input.scriptCostUsd ?? '?'} USD` },
        { at, step: 'na fila', detail: `${input.model} · ${input.aspectRatio} · ${input.duration}s · ${input.photos.length} foto(s)` },
      ],
    };
    const created = await this.deps.jobRepo.createTenantJobIfUnderLimit(
      {
        id: jobId,
        tenantId,
        workflow: VIDEO_WORKFLOW,
        status: 'pending',
        lockKey: `${VIDEO_WORKFLOW}:${tenantId}:${jobId}`,
        currentStage: 'queued',
        metadata: metadata as any,
      },
      MAX_ACTIVE_JOBS_PER_TENANT,
      new Date(this.deps.now() - STALE_JOB_MS),
      period,
    );
    if (created === 'period_limit') {
      throw new AppError(403, 'VIDEO_QUOTA_EXCEEDED', 'Limite de vídeos do mês atingido. Faça upgrade do plano para continuar.');
    }
    if (created === 'active_limit') {
      throw new AppError(409, 'VIDEO_JOBS_LIMIT', 'Você já tem 2 vídeos sendo gerados. Aguarde um terminar para criar outro.');
    }
    console.log('[studio-video] job criado', { jobId, tenantId, model: input.model, aspect: input.aspectRatio, adjust: !!input.feedback });
    try {
      await this.deps.enqueue(jobId, tenantId);
    } catch (err) {
      await this.deps.jobRepo.patchWorkflowJob(jobId, { status: 'error', error: 'Não foi possível iniciar a geração.', updatedAt: new Date() });
      throw err;
    }
    return { jobId };
  }

  private toStatus(job: any): VideoJobStatus {
    const meta = (job.metadata ?? {}) as Partial<VideoJobMetadata>;
    const artifacts = (job.artifacts ?? {}) as { assetId?: string; videoUrl?: string };
    return {
      jobId: job.id,
      status: job.status === 'done' || job.status === 'error' || job.status === 'running' ? job.status : 'pending',
      stage: (job.currentStage ?? 'queued') as VideoStage,
      prompt: meta.prompt ?? '',
      error: job.error ?? null,
      assetId: artifacts.assetId ?? null,
      videoUrl: artifacts.videoUrl ?? null,
      createdAt: new Date(job.createdAt).toISOString(),
    };
  }

  private submitParams(meta: VideoJobMetadata): VideoSubmitParams {
    return {
      model: meta.model,
      prompt: meta.videoPrompt,
      duration: meta.duration,
      aspect_ratio: meta.aspectRatio,
      resolution: VIDEO_RESOLUTION,
      generate_audio: true,
      referenceImageUrls: meta.photos.map((p) => p.url),
    };
  }

  async getJob(tenantId: string, jobId: string): Promise<VideoJobStatus> {
    const job = await this.deps.jobRepo.getWorkflowJob(jobId);
    // mesmo 404 para job inexistente ou de outro tenant
    if (!job || job.tenantId !== tenantId || job.workflow !== VIDEO_WORKFLOW) {
      throw new AppError(404, 'VIDEO_JOB_NOT_FOUND', 'Vídeo não encontrado.');
    }
    return this.toStatus(job);
  }

  async listActiveJobs(tenantId: string): Promise<VideoJobStatus[]> {
    const jobs = await this.deps.jobRepo.listTenantWorkflowJobs(tenantId, VIDEO_WORKFLOW, ['pending', 'running']);
    const staleBefore = this.deps.now() - STALE_JOB_MS;
    return jobs.filter((j) => new Date(j.updatedAt).getTime() > staleBefore).map((j) => this.toStatus(j));
  }

  /** Job do BullMQ falhou fora do processJob: não deixa o workflow_job preso em running. */
  async markFailed(jobId: string, reason: string): Promise<void> {
    const job = await this.deps.jobRepo.getWorkflowJob(jobId);
    if (!job || job.status === 'done' || job.status === 'error') return;
    console.error('[studio-video] job marcado como erro pelo worker', { jobId, reason });
    await this.deps.jobRepo.patchWorkflowJob(jobId, { status: 'error', error: 'A geração do vídeo foi interrompida. Tente novamente.', updatedAt: new Date() });
    const rootAssetId = (job.metadata as Partial<VideoJobMetadata> | null)?.rootAssetId;
    if (rootAssetId) await this.deps.modQuota.refund(rootAssetId);
  }

  /** Executado pelo worker: envia ao OpenRouter, acompanha, salva na biblioteca. Retomável pelo openrouterJobId. */
  async processJob(jobId: string): Promise<void> {
    const job = await this.deps.jobRepo.getWorkflowJob(jobId);
    if (!job || job.status === 'done' || job.status === 'error') return;
    // IA do vídeo usa a chave do dono do cliente
    return runWithTenant(job.tenantId, () => this.processLoadedJob(jobId, job));
  }

  private async processLoadedJob(jobId: string, job: NonNullable<Awaited<ReturnType<Deps['jobRepo']['getWorkflowJob']>>>): Promise<void> {
    const { jobRepo, video } = this.deps;
    const meta = { ...(job.metadata as unknown as VideoJobMetadata) };
    meta.log = [...(meta.log ?? [])];
    const startedAt = new Date(meta.startedAt).getTime();
    const log = (step: string, detail?: string) => {
      meta.log.push({ at: new Date(this.deps.now()).toISOString(), step, ...(detail ? { detail } : {}) });
      console.log(`[studio-video] ${step}`, { jobId, ...(detail ? { detail } : {}) });
    };
    const save = (patch: Record<string, unknown>) =>
      jobRepo.patchWorkflowJob(jobId, { ...patch, metadata: meta as any, updatedAt: new Date() } as any);
    // ajuste que falhou devolve a mudança; vídeo novo que falhou não conta na cota (status error)
    const fail = async (message: string) => {
      await save({ status: 'error', error: message });
      if (meta.rootAssetId) await this.deps.modQuota.refund(meta.rootAssetId);
    };

    await save({ status: 'running' });

    try {
      if (!meta.openrouterJobId) {
        await save({ currentStage: 'submitting' });
        await this.deps.llm.assertCreditsAvailable();
        meta.openrouterJobId = await video.submit(this.submitParams(meta));
        meta.submittedAt = new Date(this.deps.now()).toISOString();
        log('enviado ao OpenRouter', `id ${meta.openrouterJobId}`);
        await save({ currentStage: 'generating' });
      } else {
        log('retomando acompanhamento', `id ${meta.openrouterJobId}`);
      }

      let lastStatus = '';
      let costUsd: number | null = null;
      let statusErrors = 0;
      for (;;) {
        if (this.deps.now() - startedAt > JOB_TIMEOUT_MS) {
          log('tempo esgotado', `${Math.round(JOB_TIMEOUT_MS / 60000)} min`);
          await fail('A geração demorou mais que o esperado. Tente novamente.');
          return;
        }
        let state;
        try {
          state = await video.getJob(meta.openrouterJobId);
        } catch (err) {
          // falha pontual: tenta de novo; persistente: desiste (vídeo pode ter sido cobrado, id fica no log)
          statusErrors += 1;
          console.warn('[studio-video] falha ao consultar status', { jobId, attempt: statusErrors, error: (err as Error).message });
          if (statusErrors >= MAX_STATUS_ERRORS) {
            log('status indisponível', (err as Error).message);
            await fail('Não foi possível acompanhar a geração do vídeo. Tente novamente em alguns minutos.');
            return;
          }
          await jobRepo.renewWorkflowJobLock(jobId);
          await this.deps.sleep(POLL_INTERVAL_MS);
          continue;
        }
        statusErrors = 0;
        if (state.status !== lastStatus) {
          lastStatus = state.status;
          log(`status ${state.status}`);
          await save({ currentStage: 'generating' });
        } else {
          await jobRepo.renewWorkflowJobLock(jobId);
        }
        if (state.status === 'completed') {
          costUsd = state.costUsd;
          break;
        }
        // qualquer outro status terminal (failed, cancelled, expired...)
        if (state.status !== 'pending' && state.status !== 'in_progress') {
          log(`encerrado no OpenRouter (${state.status})`, state.error ?? 'sem detalhe');
          const filtered = /no output|moderat|safety|content|policy/i.test(state.error ?? '');
          await fail(filtered
            ? 'O vídeo foi bloqueado pelo filtro de conteúdo do modelo. Ajuste o roteiro ou as fotos e tente de novo.'
            : 'A geração do vídeo falhou. Tente novamente.');
          return;
        }
        await this.deps.sleep(POLL_INTERVAL_MS);
      }

      meta.videoCostUsd = costUsd;
      log('vídeo pronto', `custo ${costUsd ?? '?'} USD · ${Math.round((this.deps.now() - startedAt) / 1000)}s`);
      await save({ currentStage: 'saving' });

      const repo = this.deps.studioRepo(job.tenantId);
      const persist = async () => {
        const buffer = await video.download(meta.openrouterJobId!);
        const url = await this.deps.store(buffer, 'mp4', 'video/mp4');
        log('salvo', `${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
        return url;
      };
      let videoUrl = '';
      for (let attempt = 1; ; attempt++) {
        try {
          videoUrl = await persist();
          break;
        } catch (err) {
          log(`falha ao salvar (tentativa ${attempt})`, (err as Error).message);
          if (attempt >= SAVE_ATTEMPTS) throw err;
          await this.deps.sleep(POLL_INTERVAL_MS);
        }
      }

      const asset = await repo.createAsset({
        tenantId: job.tenantId,
        type: 'video',
        url: videoUrl,
        complianceStatus: 'pending_compliance',
        costUsd: sumCosts(meta.scriptCostUsd, meta.videoCostUsd),
        processingTimeMs: this.deps.now() - startedAt,
        ...(meta.rootAssetId
          ? { rootAssetId: meta.rootAssetId }
          : { modificationsRemaining: meta.modificationsLimit ?? null }),
        complianceNotes: JSON.stringify({
          source: VIDEO_SOURCE,
          prompt: meta.prompt,
          scenes: meta.scenes,
          photos: meta.photos,
          aspectRatio: meta.aspectRatio,
          durationSeconds: meta.duration,
          model: meta.model,
          feedback: meta.feedback,
          generatedAt: new Date(this.deps.now()).toISOString(),
          videoJobId: jobId,
        }),
      });
      // versão nova do ajuste fica em evidência
      if (meta.rootAssetId) await repo.setActiveAsset(meta.rootAssetId, asset.id);
      log('concluído', `asset ${asset.id}`);
      await save({ status: 'done', currentStage: 'done', artifacts: { assetId: asset.id, videoUrl } });
    } catch (err) {
      log('erro', (err as Error).message);
      console.error('[studio-video] job falhou', { jobId, error: (err as Error).message });
      await fail('Não foi possível gerar o vídeo agora. Tente novamente em alguns minutos.');
    }
  }
}
