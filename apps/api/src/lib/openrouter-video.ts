import { AppError } from '../middleware/errorHandler.js';
import { resolveAiKey } from './ai-key-context.js';
import { externalFetch, ExternalHttpError } from './http-client.js';
import { captureServerEvent } from './analytics.js';

// API assíncrona de vídeo: POST /videos → GET /videos/{id} → GET /videos/{id}/content
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type VideoOperation = 'submit' | 'status' | 'download';
function reportFailure(operation: VideoOperation, kind: 'timeout' | 'network' | 'authentication' | 'provider_error' | 'invalid_response', status?: number) {
  const safe = { provider: 'openrouter', operation, kind, ...(status !== undefined ? { status } : {}) };
  console.warn('[openrouter-video] falha sanitizada', safe);
  captureServerEvent('openrouter_video_failure', safe);
}

async function videoFetch(operation: VideoOperation, url: string, init: RequestInit): Promise<Response> {
  try { return await externalFetch(url, init); }
  catch (err) {
    reportFailure(operation, err instanceof ExternalHttpError && err.code === 'TIMEOUT' ? 'timeout' : 'network');
    throw err;
  }
}

function reportHttpFailure(operation: VideoOperation, status: number) {
  reportFailure(operation, status === 401 || status === 403 ? 'authentication' : 'provider_error', status);
}

export interface VideoSubmitParams {
  model: string;
  prompt: string;
  duration: number;
  aspect_ratio: '9:16' | '16:9';
  resolution: string;
  generate_audio: boolean;
  referenceImageUrls: string[];
}

export interface VideoJobState {
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  costUsd: number | null;
  error: string | null;
  unsignedUrls: string[];
}

// chave do dono do cliente (ady ou parceiro); ver lib/ai-key-context
async function apiKey(): Promise<string> {
  return (await resolveAiKey()).key;
}

/** Corpo enviado ao OpenRouter. */
export function buildVideoRequestBody(p: VideoSubmitParams) {
  return {
    model: p.model,
    prompt: p.prompt,
    duration: p.duration,
    aspect_ratio: p.aspect_ratio,
    resolution: p.resolution,
    generate_audio: p.generate_audio,
    ...(p.referenceImageUrls.length
      ? { input_references: p.referenceImageUrls.map((url) => ({ type: 'image_url', image_url: { url } })) }
      : {}),
  };
}

export const openrouterVideoClient = {
  async submit(p: VideoSubmitParams): Promise<string> {
    let key: string;
    try { key = await apiKey(); }
    catch (error) {
      if (error instanceof AppError && error.code === 'AI_CONTEXT_MISSING') throw error;
      reportFailure('submit', 'authentication');
      throw new AppError(503, 'OPENROUTER_VIDEO_KEY_UNAVAILABLE', 'Chave de vídeo indisponível.', { notSubmitted: true });
    }
    const res = await videoFetch('submit', `${OPENROUTER_BASE}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(buildVideoRequestBody(p)),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      reportHttpFailure('submit', res.status);
      throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', `Serviço de vídeo recusou o pedido (${res.status}).`);
    }
    let json: any;
    try { json = await res.json(); }
    catch { reportFailure('submit', 'invalid_response'); throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', 'Resposta inválida do serviço de vídeo.'); }
    if (typeof json?.id !== 'string' || !json.id.trim() || json.id.length > 256) { reportFailure('submit', 'invalid_response'); throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', 'OpenRouter não retornou o id do job.'); }
    return json.id as string;
  },

  async getJob(id: string): Promise<VideoJobState> {
    const res = await videoFetch('status', `${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${await apiKey()}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      reportHttpFailure('status', res.status);
      throw new AppError(502, 'OPENROUTER_VIDEO_STATUS_ERROR', `Status do vídeo indisponível (${res.status}).`);
    }
    let json: any;
    try { json = await res.json(); }
    catch { reportFailure('status', 'invalid_response'); throw new AppError(502, 'OPENROUTER_VIDEO_STATUS_ERROR', 'Resposta inválida do serviço de vídeo.'); }
    const rawError = json?.error ? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) : '';
    const safeError = rawError ? (/no output|moderat|safety|content|policy/i.test(rawError) ? 'content policy' : 'Falha no provedor de vídeo.') : null;
    const status = ['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'].includes(json?.status) ? json.status : 'unknown';
    return {
      status,
      costUsd: typeof json?.usage?.cost === 'number' ? json.usage.cost : null,
      error: safeError,
      unsignedUrls: Array.isArray(json?.unsigned_urls) ? json.unsigned_urls : [],
    };
  },

  async download(id: string): Promise<Buffer> {
    const res = await videoFetch('download', `${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}/content?index=0`, {
      headers: { Authorization: `Bearer ${await apiKey()}` },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) { reportHttpFailure('download', res.status); throw new AppError(502, 'OPENROUTER_VIDEO_DOWNLOAD_ERROR', `Falha ao baixar o vídeo (${res.status}).`); }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_VIDEO_BYTES) {
      throw new AppError(502, 'OPENROUTER_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_VIDEO_BYTES) throw new AppError(502, 'OPENROUTER_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    return buffer;
  },
};

export type OpenRouterVideoClient = typeof openrouterVideoClient;
