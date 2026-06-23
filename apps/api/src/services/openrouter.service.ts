import { AppError } from '../middleware/errorHandler.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError(500, 'OPENROUTER_API_KEY_MISSING', 'OPENROUTER_API_KEY não configurada.');
  return apiKey;
}

export const openrouterService = {
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options: { temperature?: number; max_tokens?: number; response_format?: { type: 'json_object' } } = {},
  ): Promise<string> {
    const apiKey = getClient();
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 1500,
        ...(options.response_format ? { response_format: options.response_format } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new AppError(502, 'OPENROUTER_CHAT_ERROR', `OpenRouter chat error: ${err}`);
    }
    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? '';
  },

  async generateImage(options: {
    model: string;
    prompt: string;
    aspect_ratio?: string;
    resolution?: string;
  }): Promise<string> {
    const apiKey = getClient();
    const response = await fetch(`${OPENROUTER_BASE}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new AppError(502, 'OPENROUTER_IMAGE_ERROR', `OpenRouter image error: ${err}`);
    }
    const data = (await response.json()) as any;
    const imageData = data.data?.[0];
    if (imageData?.b64_json) return `data:image/png;base64,${imageData.b64_json}`;
    if (imageData?.url) {
      const imgResponse = await fetch(imageData.url);
      const buffer = await imgResponse.arrayBuffer();
      return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
    }
    throw new AppError(502, 'OPENROUTER_IMAGE_EMPTY', 'OpenRouter não retornou imagem.');
  },

  async generateVideo(options: {
    model: string;
    prompt: string;
    duration?: number;
    resolution?: string;
    aspect_ratio?: string;
    generate_audio?: boolean;
  }): Promise<string> {
    const apiKey = getClient();

    // 1. Submeter job
    const submitResponse = await fetch(`${OPENROUTER_BASE}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        ...(options.duration ? { duration: options.duration } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
        ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
        ...(options.generate_audio !== undefined ? { generate_audio: options.generate_audio } : {}),
      }),
    });
    if (!submitResponse.ok) {
      const err = await submitResponse.text();
      throw new AppError(502, 'OPENROUTER_VIDEO_SUBMIT_ERROR', `OpenRouter video submit error: ${err}`);
    }
    const submitData = (await submitResponse.json()) as any;
    const pollingUrl = submitData.polling_url;
    if (!pollingUrl) throw new AppError(502, 'OPENROUTER_VIDEO_NO_POLL', 'OpenRouter não retornou polling_url.');

    // 2. Polling até completar (máx 40 tentativas * 3s = 120s)
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollResponse = await fetch(pollingUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!pollResponse.ok) continue;
      const pollData = (await pollResponse.json()) as any;
      if (pollData.status === 'completed') {
        const videoUrl = pollData.unsigned_urls?.[0];
        if (videoUrl) return videoUrl;
        throw new AppError(502, 'OPENROUTER_VIDEO_NO_URL', 'Job completed mas sem URL de vídeo.');
      }
      if (pollData.status === 'failed') {
        throw new AppError(502, 'OPENROUTER_VIDEO_FAILED', `Geração de vídeo falhou: ${pollData.error || 'desconhecido'}`);
      }
    }
    throw new AppError(502, 'OPENROUTER_VIDEO_TIMEOUT', 'Timeout na geração de vídeo (120s).');
  },
};
