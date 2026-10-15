import { AppError } from '../middleware/errorHandler.js';

// API assíncrona de vídeo: POST /videos → GET /videos/{id} → GET /videos/{id}/content
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

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

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AppError(500, 'OPENROUTER_API_KEY_MISSING', 'OPENROUTER_API_KEY não configurada.');
  return key;
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
    const res = await fetch(`${OPENROUTER_BASE}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(buildVideoRequestBody(p)),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[openrouter-video] submit falhou', { status: res.status, body: body.slice(0, 1000) });
      throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', `Serviço de vídeo recusou o pedido (${res.status}).`);
    }
    const json = (await res.json()) as any;
    if (!json?.id) throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', 'OpenRouter não retornou o id do job.');
    return json.id as string;
  },

  async getJob(id: string): Promise<VideoJobState> {
    const res = await fetch(`${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[openrouter-video] status falhou', { id, status: res.status, body: body.slice(0, 1000) });
      throw new AppError(502, 'OPENROUTER_VIDEO_STATUS_ERROR', `Status do vídeo indisponível (${res.status}).`);
    }
    const json = (await res.json()) as any;
    return {
      status: String(json?.status ?? ''),
      costUsd: typeof json?.usage?.cost === 'number' ? json.usage.cost : null,
      error: json?.error ? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) : null,
      unsignedUrls: Array.isArray(json?.unsigned_urls) ? json.unsigned_urls : [],
    };
  },

  async download(id: string): Promise<Buffer> {
    const res = await fetch(`${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}/content?index=0`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new AppError(502, 'OPENROUTER_VIDEO_DOWNLOAD_ERROR', `Falha ao baixar o vídeo (${res.status}).`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_VIDEO_BYTES) {
      throw new AppError(502, 'OPENROUTER_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_VIDEO_BYTES) throw new AppError(502, 'OPENROUTER_VIDEO_TOO_LARGE', 'Vídeo maior que o permitido.');
    return buffer;
  },
};

export type OpenRouterVideoClient = typeof openrouterVideoClient;
