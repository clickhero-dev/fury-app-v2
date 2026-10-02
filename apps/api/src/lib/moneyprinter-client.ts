import { AppError } from '../middleware/errorHandler.js';

/** Estado de tarefa do MoneyPrinterTurbo (app/models/const.py). */
export const MPT_STATE = { failed: -1, complete: 1, processing: 4 } as const;

/** Arquivo final de uma tarefa: /tasks/<uuid>/<nome>.mp4 */
const TASK_VIDEO_PATH = /^\/?tasks\/([0-9a-f-]{36}\/[\w.-]+\.mp4)$/;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** Músicas embutidas do MPT — uploads usam nome UUID hex, nunca este padrão. */
export const BUILTIN_SONG_PATTERN = /^output\d{3}\.mp3$/;

export interface MptVideoParams {
  video_subject: string;
  video_language: string;
  video_aspect: '9:16' | '1:1' | '16:9';
  video_source: string;
  video_concat_mode: 'random' | 'sequential';
  video_transition_mode: string | null;
  match_materials_to_script: boolean;
  video_count: number;
  voice_name: string;
  voice_rate: number;
  bgm_type: string;
  bgm_file: string;
  bgm_volume: number;
  subtitle_enabled: boolean;
  subtitle_position: 'top' | 'center' | 'bottom';
  subtitle_display_mode: 'sentence';
  subtitle_animation: 'none';
  font_name: string;
  paragraph_number: number;
}

export interface MptTask {
  state: number;
  progress: number;
  videos: string[] | null;
  script: string | null;
  audioDuration: number | null;
  failedStage: string | null;
  error: string | null;
}

function baseUrl(): string {
  const url = process.env.MONEYPRINTER_API_URL;
  if (!url) throw new AppError(503, 'MPT_NOT_CONFIGURED', 'Geração de vídeo indisponível no momento.');
  return url.replace(/\/+$/, '');
}

function authHeaders(): Record<string, string> {
  const key = process.env.MONEYPRINTER_API_KEY;
  return key ? { 'x-api-key': key } : {};
}

async function readJson(res: Response, code: string): Promise<any> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[moneyprinter] resposta de erro', { code, status: res.status, body: body.slice(0, 500) });
    throw new AppError(502, code, 'Serviço de vídeo indisponível no momento. Tente novamente.');
  }
  return res.json();
}

export const moneyPrinterClient = {
  async createVideoTask(params: MptVideoParams): Promise<string> {
    const res = await fetch(`${baseUrl()}/api/v1/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await readJson(res, 'MPT_CREATE_FAILED');
    const taskId = json?.data?.task_id;
    if (!taskId) throw new AppError(502, 'MPT_CREATE_FAILED', 'MoneyPrinterTurbo não retornou task_id.');
    return taskId as string;
  },

  /** null = tarefa não existe mais (ex.: MPT reiniciou sem Redis). */
  async getTask(taskId: string): Promise<MptTask | null> {
    const res = await fetch(`${baseUrl()}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    const d = (await readJson(res, 'MPT_STATUS_FAILED'))?.data ?? {};
    return {
      state: Number(d.state),
      progress: Number(d.progress ?? 0),
      videos: Array.isArray(d.videos) ? d.videos : null,
      script: typeof d.script === 'string' ? d.script : null,
      audioDuration: typeof d.audio_duration === 'number' ? d.audio_duration : null,
      failedStage: d.failed_stage ?? null,
      error: d.error ?? null,
    };
  },

  /** Baixa um arquivo da tarefa; `path` vem de `videos[]` (ex.: /tasks/<id>/final-1.mp4). */
  async downloadTaskFile(path: string): Promise<Buffer> {
    const match = path.match(TASK_VIDEO_PATH);
    if (!match || match[1].includes('..')) throw new AppError(502, 'MPT_BAD_PATH', 'Caminho de vídeo inválido.');
    const res = await fetch(`${baseUrl()}/api/v1/download/${match[1]}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new AppError(502, 'MPT_DOWNLOAD_FAILED', `Falha ao baixar vídeo (${res.status}).`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_VIDEO_BYTES) {
      throw new AppError(502, 'MPT_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_VIDEO_BYTES) throw new AppError(502, 'MPT_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    return buffer;
  },

  async listBuiltinSongs(): Promise<string[]> {
    const res = await fetch(`${baseUrl()}/api/v1/musics`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    const files = ((await readJson(res, 'MPT_MUSIC_LIST_FAILED'))?.data?.files ?? []) as Array<{ file: string }>;
    return files.map((f) => f.file).filter((f) => BUILTIN_SONG_PATTERN.test(f)).sort();
  },

  /** Envia música ao MPT; devolve o nome UUID que ele guardou. */
  async uploadMusic(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), fileName);
    const res = await fetch(`${baseUrl()}/api/v1/musics`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 400) throw new AppError(400, 'INVALID_MUSIC_FILE', 'Arquivo de música inválido.');
    const file = (await readJson(res, 'MPT_MUSIC_UPLOAD_FAILED'))?.data?.file;
    if (!file) throw new AppError(502, 'MPT_MUSIC_UPLOAD_FAILED', 'MoneyPrinterTurbo não retornou o arquivo.');
    return file as string;
  },
};

export type MoneyPrinterClient = typeof moneyPrinterClient;
