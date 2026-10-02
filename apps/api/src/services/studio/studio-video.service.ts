import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';
import { StudioRepository } from '../../repository/studio.repository.js';
import { WorkflowJobRepository } from '../../repository/workflow-job.repository.js';
import { moneyPrinterClient, MPT_STATE, type MoneyPrinterClient, type MptVideoParams } from '../../lib/moneyprinter-client.js';
import { ensureStudioAssetsDir, studioAssetsDir } from '../../lib/temp-storage.js';
import { uploadAsset } from '../storage/storage.service.js';

export const VIDEO_WORKFLOW = 'studio-video';
const MAX_ACTIVE_JOBS_PER_TENANT = 2;
const MAX_MPT_SUBMISSIONS = 3;
const JOB_TIMEOUT_MS = 25 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
// sem heartbeat há 10 min = job órfão (worker morreu); não bloqueia o tenant
const STALE_JOB_MS = 10 * 60 * 1000;
const MAX_MUSIC_TRACKS_PER_TENANT = 30;

// Extensão → MIME fixo; nunca confiar no mimetype/extensão do cliente
const MUSIC_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

export const VIDEO_VOICES = [
  { id: 'pt-BR-AntonioNeural-Male', key: 'antonio', name: 'Antonio', gender: 'Masculina' },
  { id: 'pt-BR-FranciscaNeural-Female', key: 'francisca', name: 'Francisca', gender: 'Feminina' },
  { id: 'pt-BR-ThalitaMultilingualNeural-Female', key: 'thalita', name: 'Thalita', gender: 'Feminina' },
] as const;

export const VIDEO_TRANSITIONS = [
  { id: 'none', label: 'Sem transição', mpt: null },
  { id: 'Shuffle', label: 'Aleatória', mpt: 'Shuffle' },
  { id: 'FadeIn', label: 'Aparecer (fade in)', mpt: 'FadeIn' },
  { id: 'FadeOut', label: 'Desaparecer (fade out)', mpt: 'FadeOut' },
  { id: 'SlideIn', label: 'Deslizar para dentro', mpt: 'SlideIn' },
  { id: 'SlideOut', label: 'Deslizar para fora', mpt: 'SlideOut' },
  { id: 'ZoomIn', label: 'Zoom de aproximação', mpt: 'ZoomIn' },
  { id: 'ZoomOut', label: 'Zoom de afastamento', mpt: 'ZoomOut' },
] as const;

export type VideoStage = 'queued' | 'script' | 'voice' | 'scenes' | 'render' | 'saving' | 'done';

export interface CreateVideoInput {
  prompt: string;
  voice: string;
  voiceRate: number;
  music: { mode: 'none' | 'random' | 'preset' | 'custom'; file?: string; trackId?: string; volume: number };
  subtitles: { enabled: boolean; position: 'top' | 'center' | 'bottom' };
  transition: string;
}

interface VideoJobMetadata {
  prompt: string;
  params: MptVideoParams;
  musicLabel: string | null;
  voiceName: string;
  mptTaskId: string | null;
  mptSubmissions: number;
  progress: number;
  startedAt: string;
  lastMptError?: string | null;
}

export interface VideoJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  stage: VideoStage;
  progress: number;
  prompt: string;
  error: string | null;
  assetId: string | null;
  videoUrl: string | null;
  createdAt: string;
}

/** Guarda o arquivo no R2 ou, sem R2 configurado, no disco servido em /studio-assets. */
async function storeFile(buffer: Buffer, ext: string, mimeType: string): Promise<string> {
  const fileName = `${randomUUID()}.${ext}`;
  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    return uploadAsset(buffer, fileName, mimeType);
  }
  await ensureStudioAssetsDir();
  await writeFile(join(studioAssetsDir, fileName), buffer);
  const base = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  return `${base}/studio-assets/${fileName}`;
}

/** Converte o progresso do MPT (degraus 5..100) em etapa nomeada + % exibida. */
export function mapMptProgress(mptProgress: number): { stage: VideoStage; progress: number } {
  const stage: VideoStage = mptProgress < 20 ? 'script' : mptProgress < 40 ? 'voice' : mptProgress < 50 ? 'scenes' : 'render';
  return { stage, progress: Math.min(95, Math.round(mptProgress * 0.95)) };
}

function songLabel(file: string): string {
  const n = Number(file.match(/\d+/)?.[0] ?? 0) + 1;
  return `Música ${String(n).padStart(2, '0')}`;
}

type Deps = {
  mpt: MoneyPrinterClient;
  studioRepo: (tenantId: string) => StudioRepository;
  jobRepo: WorkflowJobRepository;
  enqueue: (jobId: string, tenantId: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  store: typeof storeFile;
  now: () => number;
};

export class StudioVideoService {
  private deps: Deps;

  constructor(deps: Partial<Deps> = {}) {
    this.deps = {
      mpt: moneyPrinterClient,
      studioRepo: (t) => new StudioRepository(t),
      jobRepo: new WorkflowJobRepository(''),
      enqueue: async () => {
        throw new Error('enqueue não configurado');
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      store: storeFile,
      now: () => Date.now(),
      ...deps,
    };
  }

  async getOptions(tenantId: string) {
    const [songs, tracks] = await Promise.all([
      this.deps.mpt.listBuiltinSongs(),
      this.deps.studioRepo(tenantId).listMusicTracks(),
    ]);
    return {
      voices: VIDEO_VOICES.map(({ id, key, name, gender }) => ({ id, key, name, gender })),
      transitions: VIDEO_TRANSITIONS.map(({ id, label }) => ({ id, label })),
      builtinSongs: songs.map((file) => ({ file, label: songLabel(file), previewPath: `/studio/video/music/builtin/${file}` })),
      userTracks: tracks.map((t) => ({ id: t.id, name: t.name, previewUrl: t.previewUrl })),
    };
  }

  async uploadMusic(tenantId: string, file: { buffer: Buffer; originalname: string; mimetype: string }) {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const mimeType = MUSIC_TYPES[ext];
    if (!mimeType) throw new AppError(400, 'INVALID_MUSIC_FILE', 'Formato inválido. Envie MP3, WAV ou M4A.');
    const existing = await this.deps.studioRepo(tenantId).listMusicTracks();
    if (existing.length >= MAX_MUSIC_TRACKS_PER_TENANT) {
      throw new AppError(409, 'MUSIC_LIMIT', `Limite de ${MAX_MUSIC_TRACKS_PER_TENANT} músicas atingido.`);
    }
    // ponytail: valida no MPT (ffmpeg) antes de guardar a cópia de prévia
    const mptFile = await this.deps.mpt.uploadMusic(file.buffer, `upload.${ext}`, mimeType);
    const previewUrl = await this.deps.store(file.buffer, ext, mimeType);
    const name = file.originalname.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 120) || `musica.${ext}`;
    const track = await this.deps.studioRepo(tenantId).createMusicTrack({ name, mptFile, previewUrl });
    return { id: track.id, name: track.name, previewUrl: track.previewUrl };
  }

  /** Resolve a música escolhida para um `bgm_file` do MPT (sorteio feito aqui, nunca o random do MPT). */
  private async resolveMusic(tenantId: string, music: CreateVideoInput['music']): Promise<{ file: string; label: string | null }> {
    if (music.mode === 'none') return { file: '', label: null };
    if (music.mode === 'preset') {
      const songs = await this.deps.mpt.listBuiltinSongs();
      if (!music.file || !songs.includes(music.file)) throw new AppError(400, 'INVALID_MUSIC', 'Música predefinida inválida.');
      return { file: music.file, label: songLabel(music.file) };
    }
    if (music.mode === 'custom') {
      const track = music.trackId ? await this.deps.studioRepo(tenantId).findMusicTrack(music.trackId) : undefined;
      if (!track) throw new AppError(400, 'INVALID_MUSIC', 'Música personalizada não encontrada.');
      return { file: track.mptFile, label: track.name };
    }
    const [songs, tracks] = await Promise.all([
      this.deps.mpt.listBuiltinSongs(),
      this.deps.studioRepo(tenantId).listMusicTracks(),
    ]);
    const pool = [...songs.map((f) => ({ file: f, label: songLabel(f) })), ...tracks.map((t) => ({ file: t.mptFile, label: t.name }))];
    if (pool.length === 0) return { file: '', label: null };
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async createJob(tenantId: string, input: CreateVideoInput): Promise<{ jobId: string }> {
    const voice = VIDEO_VOICES.find((v) => v.id === input.voice);
    if (!voice) throw new AppError(400, 'INVALID_VOICE', 'Voz inválida.');
    const transition = VIDEO_TRANSITIONS.find((t) => t.id === input.transition);
    if (!transition) throw new AppError(400, 'INVALID_TRANSITION', 'Transição inválida.');
    const music = await this.resolveMusic(tenantId, input.music);

    const params: MptVideoParams = {
      video_subject: input.prompt,
      video_language: 'pt-BR',
      video_aspect: '9:16',
      video_source: 'pixabay',
      video_concat_mode: 'sequential',
      video_transition_mode: transition.mpt,
      match_materials_to_script: true,
      video_count: 1,
      voice_name: voice.id,
      voice_rate: input.voiceRate,
      bgm_type: music.file ? 'custom' : '',
      bgm_file: music.file,
      bgm_volume: music.file ? input.music.volume : 0,
      subtitle_enabled: input.subtitles.enabled,
      subtitle_position: input.subtitles.position,
      subtitle_display_mode: 'sentence',
      subtitle_animation: 'none',
      font_name: 'BeVietnamPro-Bold.ttf',
      paragraph_number: 1,
    };

    const jobId = randomUUID();
    const metadata: VideoJobMetadata = {
      prompt: input.prompt,
      params,
      musicLabel: music.label,
      voiceName: voice.name,
      mptTaskId: null,
      mptSubmissions: 0,
      progress: 0,
      startedAt: new Date(this.deps.now()).toISOString(),
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
    );
    if (!created) {
      throw new AppError(409, 'VIDEO_JOBS_LIMIT', 'Você já tem 2 vídeos sendo gerados. Aguarde um terminar para criar outro.');
    }
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
      progress: job.status === 'done' ? 100 : Number(meta.progress ?? 0),
      prompt: meta.prompt ?? '',
      error: job.error ?? null,
      assetId: artifacts.assetId ?? null,
      videoUrl: artifacts.videoUrl ?? null,
      createdAt: new Date(job.createdAt).toISOString(),
    };
  }

  async getJob(tenantId: string, jobId: string): Promise<VideoJobStatus> {
    const job = await this.deps.jobRepo.getWorkflowJob(jobId);
    // ponytail: mesmo 404 para job inexistente ou de outro tenant
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

  /** Executado pelo worker: envia ao MPT, acompanha, salva o vídeo na biblioteca. Retomável. */
  async processJob(jobId: string): Promise<void> {
    const { jobRepo, mpt } = this.deps;
    const job = await jobRepo.getWorkflowJob(jobId);
    if (!job || job.status === 'done' || job.status === 'error') return;
    const meta = { ...(job.metadata as unknown as VideoJobMetadata) };
    const startedAt = new Date(meta.startedAt).getTime();
    const save = (patch: Record<string, unknown>) =>
      jobRepo.patchWorkflowJob(jobId, { ...patch, metadata: meta as any, updatedAt: new Date() } as any);
    const fail = (message: string) => save({ status: 'error', error: message });

    await save({ status: 'running' });

    try {
      let finished: Awaited<ReturnType<MoneyPrinterClient['getTask']>> = null;
      while (!finished) {
        if (this.deps.now() - startedAt > JOB_TIMEOUT_MS) {
          await fail('A geração demorou mais que o esperado. Tente novamente.');
          return;
        }
        if (!meta.mptTaskId) {
          if (meta.mptSubmissions >= MAX_MPT_SUBMISSIONS) {
            console.error('[studio-video] MPT falhou em todas as tentativas', { jobId, lastError: meta.lastMptError });
            await fail('Não foi possível gerar o vídeo agora. Tente novamente em alguns minutos.');
            return;
          }
          meta.mptTaskId = await mpt.createVideoTask(meta.params);
          meta.mptSubmissions += 1;
          await save({ currentStage: 'script' });
        }

        let task: Awaited<ReturnType<MoneyPrinterClient['getTask']>>;
        try {
          task = await mpt.getTask(meta.mptTaskId);
        } catch (err) {
          // ponytail: falha de rede pontual — tenta de novo até o timeout
          console.warn('[studio-video] falha ao consultar MPT', { jobId, error: (err as Error).message });
          await this.deps.sleep(POLL_INTERVAL_MS);
          continue;
        }

        if (!task || task.state === MPT_STATE.failed) {
          meta.lastMptError = task ? `${task.failedStage ?? '?'}: ${task.error ?? ''}` : 'task not found';
          meta.mptTaskId = null;
          await this.deps.sleep(POLL_INTERVAL_MS * 2);
          continue;
        }
        if (task.state === MPT_STATE.complete) {
          finished = task;
          break;
        }
        const mapped = mapMptProgress(task.progress);
        if (mapped.progress !== meta.progress) {
          meta.progress = mapped.progress;
          await save({ currentStage: mapped.stage });
        } else {
          await jobRepo.renewWorkflowJobLock(jobId);
        }
        await this.deps.sleep(POLL_INTERVAL_MS);
      }

      const videoPath = finished.videos?.[0];
      if (!videoPath) {
        await fail('O vídeo foi gerado sem arquivo final. Tente novamente.');
        return;
      }
      meta.progress = 97;
      await save({ currentStage: 'saving' });

      const buffer = await mpt.downloadTaskFile(videoPath);
      const videoUrl = await this.deps.store(buffer, 'mp4', 'video/mp4');
      const asset = await this.deps.studioRepo(job.tenantId).createAsset({
        tenantId: job.tenantId,
        type: 'video',
        url: videoUrl,
        complianceStatus: 'pending_compliance',
        processingTimeMs: this.deps.now() - startedAt,
        complianceNotes: JSON.stringify({
          source: 'moneyprinterturbo',
          prompt: meta.prompt,
          script: finished.script,
          durationSeconds: finished.audioDuration,
          voice: meta.voiceName,
          music: meta.musicLabel,
          generatedAt: new Date(this.deps.now()).toISOString(),
        }),
      });
      meta.progress = 100;
      await save({ status: 'done', currentStage: 'done', artifacts: { assetId: asset.id, videoUrl } });
    } catch (err) {
      console.error('[studio-video] job falhou', { jobId, error: (err as Error).message });
      await fail('Não foi possível gerar o vídeo agora. Tente novamente em alguns minutos.');
    }
  }
}
