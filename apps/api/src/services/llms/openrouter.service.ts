import { AppError } from '../../middleware/errorHandler.js';
import { persistOpenRouterImageResponse } from '../../lib/openrouter-image-response.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AppError(500, 'OPENROUTER_API_KEY_MISSING', 'OPENROUTER_API_KEY não configurada.');
  return apiKey;
}

/**
 * Fetch com timeout (AbortController). Uma conexão pendurada SEM abort trava o
 * job do planner por ~10min (ou mais) — a tela "gerando..." congela sem
 * progresso. Timeout em ms; abortado → erro rápido → job falha/retoma, não pende.
 */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 180_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
};

// ─── Estado de créditos OpenRouter ───────────────────────────────────────────
// A API guarda em memória (com TTL) o estado do saldo para checá-lo ANTES de
// chamar o OpenRouter e devolver erro apropriado (402) ao frontend, em vez de
// falhar com retries genéricos quando o saldo acaba.
export type CreditState = {
  hasCredits: boolean;
  credits: number | null; // saldo restante em USD; null = desconhecido
  checkedAt: string | null;
  isFreeTier?: boolean;
};

// Mínimo para considerar que há créditos (cobre uma geração barata)
const CREDIT_MIN_BALANCE = 0.05;
// TTL do cache do saldo — evita bater no /auth/key a cada chamada
const CREDIT_CHECK_TTL_MS = 60_000;
// Mensagem client-safe: não expõe custos/saldo (o Fury assume o custo da criação)
const INSUFFICIENT_CREDITS_MESSAGE =
  'Estamos impossibilitados de gerar imagens no momento. Por favor, contate o suporte.';

let creditCache: { expiresAt: number; state: CreditState } | null = null;

/** Extrai o saldo restante (USD) de qualquer shape que o OpenRouter retorne. */
function parseRemainingCredits(body: { data?: Record<string, unknown> }): number | null {
  const d = body?.data ?? {};
  if (typeof d.limit === 'number' && typeof d.usage === 'number') {
    return Math.max(0, d.limit - d.usage);
  }
  if (typeof d.credits === 'number') return Math.max(0, d.credits);
  if (typeof d.total_credits === 'number' && typeof d.total_usage === 'number') {
    return Math.max(0, d.total_credits - d.total_usage);
  }
  return null;
}

async function fetchCreditStateFromOpenRouter(): Promise<CreditState> {
  const apiKey = getClient();
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    // Se o check falhar, fail-open: não bloqueia a geração por indisponibilidade
    return { hasCredits: true, credits: null, checkedAt: null };
  }
  if (!res.ok) {
    // Não-autorizado/erro no check também é fail-open
    return { hasCredits: true, credits: null, checkedAt: null };
  }
  const body = await res.json() as { data?: Record<string, unknown> };
  const credits = parseRemainingCredits(body);
  const isFreeTier = (body?.data?.is_free_tier as boolean | undefined) === true;
  const hasCredits = credits !== null && credits > CREDIT_MIN_BALANCE && !isFreeTier;
  return { hasCredits, credits, checkedAt: new Date().toISOString(), isFreeTier };
}

/** Detecta erro de créditos insuficientes no corpo de resposta do OpenRouter. */
function isInsufficientCreditsError(body: string): boolean {
  if (!body) return false;
  try {
    const json = JSON.parse(body) as { error?: { code?: number; message?: string } };
    return json?.error?.code === 402 || /insufficient credits/i.test(json?.error?.message ?? '');
  } catch {
    return /insufficient credits/i.test(body);
  }
}

function assertCreditsOrThrow(state: CreditState): void {
  if (state.credits !== null && !state.hasCredits) {
    throw new AppError(402, 'OPENROUTER_INSUFFICIENT_CREDITS', INSUFFICIENT_CREDITS_MESSAGE);
  }
}

export const openrouterService = {
  async chat(
    messages: ChatMessage[],
    options: { model?: string; temperature?: number; max_tokens?: number; response_format?: { type: 'json_object' } } = {},
  ): Promise<string> {
    const apiKey = getClient();
    const response = await fetchWithTimeout(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model ?? 'deepseek/deepseek-chat',
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

  /** Estado atual do saldo OpenRouter, com cache em memória (TTL). */
  async getCreditState(force = false): Promise<CreditState> {
    if (!force && creditCache && creditCache.expiresAt > Date.now()) return creditCache.state;
    const state = await fetchCreditStateFromOpenRouter();
    creditCache = { expiresAt: Date.now() + CREDIT_CHECK_TTL_MS, state };
    return state;
  },

  /** Reset do cache de créditos (útil em testes e pós-recarga de saldo). */
  clearCreditCache(): void {
    creditCache = null;
  },

  /**
   * Garante QUE há saldo antes de uma geração. Lança AppError 402
   * (OPENROUTER_INSUFFICIENT_CREDITS) quando o saldo está zerado; fail-open
   * quando o saldo é desconhecido (não bloqueia por indisponibilidade).
   */
  async assertCreditsAvailable(): Promise<void> {
    const state = await openrouterService.getCreditState();
    assertCreditsOrThrow(state);
  },

  async generateImage(options: {
    model: string;
    prompt: string;
    aspect_ratio?: string;
    resolution?: string;
    logoUrl?: string;
    previousImageUrl?: string;
  }): Promise<string> {
    const apiKey = getClient();
    const response = await fetchWithTimeout(`${OPENROUTER_BASE}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
        ...(options.previousImageUrl ? { image: options.previousImageUrl } : options.logoUrl ? { image: options.logoUrl } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      if (isInsufficientCreditsError(err)) {
        throw new AppError(402, 'OPENROUTER_INSUFFICIENT_CREDITS', INSUFFICIENT_CREDITS_MESSAGE);
      }
      throw new AppError(502, 'OPENROUTER_IMAGE_ERROR', `OpenRouter image error: ${err}`);
    }
    const data = (await response.json()) as any;
    const imageData = data.data?.[0];
    let result: string;
    if (imageData?.b64_json) result = `data:image/png;base64,${imageData.b64_json}`;
    else if (imageData?.url) {
      const imgResponse = await fetch(imageData.url);
      const buffer = await imgResponse.arrayBuffer();
      result = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
    } else throw new AppError(502, 'OPENROUTER_IMAGE_EMPTY', 'OpenRouter não retornou imagem.');

    // ponytail: composite logo onto generated image if provided
    if (options.logoUrl) {
      try {
        const { default: sharp } = await import('sharp');
        const match = result.match(/^data:image\/\w+;base64,(.+)$/);
        if (match) {
          const imgBuf = Buffer.from(match[1], 'base64');
          const logoResp = await fetch(options.logoUrl);
          const logoBuf = Buffer.from(await logoResp.arrayBuffer());
          const logoResized = await sharp(logoBuf).resize(120, null, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
          const composited = await sharp(imgBuf).resize(1080, 1080, { fit: 'inside' }).composite([
            { input: logoResized, top: 20, left: 20 },
          ]).png().toBuffer();
          result = `data:image/png;base64,${composited.toString('base64')}`;
        }
      } catch (err) {
        console.warn('[openrouter] Logo overlay failed:', (err as Error).message);
      }
    }

    return result;
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

    // Helper: submit a video job and return the polling URL
    async function submitJob(prompt: string): Promise<string> {
      const submitResponse = await fetch(`${OPENROUTER_BASE}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: options.model,
          prompt,
          ...(options.duration ? { duration: options.duration } : {}),
          ...(options.resolution ? { resolution: options.resolution } : {}),
          ...(options.aspect_ratio ? { aspect_ratio: options.aspect_ratio } : {}),
          ...(options.generate_audio !== undefined ? { generate_audio: options.generate_audio } : {}),
        }),
      });
      if (!submitResponse.ok) {
        const err = await submitResponse.text();
        throw new AppError(500, 'OPENROUTER_VIDEO_SUBMIT_ERROR', `OpenRouter video submit error: ${err}`);
      }
      const submitData = (await submitResponse.json()) as any;
      const pollingUrl = submitData.polling_url;
      if (!pollingUrl) throw new AppError(500, 'OPENROUTER_VIDEO_NO_POLL', 'OpenRouter não retornou polling_url.');
      return pollingUrl;
    }

    // Helper: poll until completion
    async function pollJob(pollingUrl: string): Promise<{ status: string; videoUrl?: string; error?: string }> {
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollResponse = await fetch(pollingUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (!pollResponse.ok) continue;
        const pollData = (await pollResponse.json()) as any;
        if (pollData.status === 'completed') {
          const videoUrl = pollData.unsigned_urls?.[0];
          return { status: 'completed', videoUrl };
        }
        if (pollData.status === 'failed') {
          return { status: 'failed', error: pollData.error || 'desconhecido' };
        }
      }
      return { status: 'timeout', error: 'Timeout (120s)' };
    }

    // First attempt
    const pollingUrl = await submitJob(options.prompt);
    let result = await pollJob(pollingUrl);

    // If content filtered, retry with sanitized prompt
    if (result.status === 'failed' && (result.error || '').includes('no output')) {
      console.log('[openrouter] Video content filtered, retrying with sanitized prompt...');
      const safePrompt = `${options.prompt} - advertisement, professional use, compliant with advertising standards`;
      const retryUrl = await submitJob(safePrompt);
      result = await pollJob(retryUrl);
    }

    if (result.status === 'completed' && result.videoUrl) {
      return result.videoUrl;
    }

    if (result.status === 'failed') {
      const msg = (result.error || '').includes('no output')
        ? 'O vídeo foi bloqueado pelo filtro de conteúdo. Tente um prompt mais genérico ou com menos detalhes específicos.'
        : `Geração de vídeo falhou: ${result.error}`;
      throw new AppError(500, 'OPENROUTER_VIDEO_FAILED', msg);
    }

    throw new AppError(500, 'OPENROUTER_VIDEO_FAILED', 'Job completed mas sem URL de vídeo (conteúdo pode ter sido filtrado).');
  },

  // ponytail: regenera anúncio preservando o original como referência visual
  async regenerateAd(options: {
    previousAdUrl: string;
    feedback: string;
    originalPrompt: string;
    model: string;
    businessName: string;
    voiceTone?: string;
    primaryColor?: string;
    logoUrl?: string;
  }): Promise<string> {
    const apiKey = getClient();
    const enhancePrompt = [
      'Você recebe um prompt original de anúncio e um feedback de ajuste.',
      `Prompt original: "${options.originalPrompt}"`,
      `Feedback: "${options.feedback}"`,
      `Marca: ${options.businessName}.`,
      '',
      'REGRAS (OBRIGATÓRIO):',
      '- Edite APENAS o trecho do prompt que o feedback menciona.',
      '- PRESERVE rigorosamente todo o restante do prompt original (tema, estilo, cores, composição).',
      '- NÃO adicione logotipos, NÃO mude o layout do anúncio, NÃO reescreva frases não mencionadas.',
      '- Mantenha a identidade visual e a descrição exata do anúncio original.',
      '- Faça a MENOR alteração possível que atenda ao feedback.',
      '',
      'Retorne APENAS o prompt editado, sem aspas, sem introdução, sem explicações.',
    ].filter(Boolean).join('\n');

    const chatResponse = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: enhancePrompt }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!chatResponse.ok) {
      const err = await chatResponse.text();
      // fallback: concat feedback ao original sem LLM
      return openrouterService.generateImage({
        model: options.model,
        prompt: `${options.originalPrompt}. Ajuste: ${options.feedback}`,
        previousImageUrl: options.previousAdUrl,
        logoUrl: options.logoUrl,
      });
    }
    const chatData = (await chatResponse.json()) as any;
    const newPrompt = (chatData.choices?.[0]?.message?.content ?? options.originalPrompt).trim();

    return openrouterService.generateImage({
      model: options.model,
      prompt: newPrompt,
      previousImageUrl: options.previousAdUrl,
      logoUrl: options.logoUrl,
    });
  },

  // ponytail: regeneração via OpenRouter — edição multimodal de imagem (Google Gemini).
  // Máscara (data URL) opcional como segunda imagem para edição por região.
  async editImage(options: {
    imageUrl: string;
    instructions: string;
    maskImageUrl?: string;
  }): Promise<string> {
    const apiKey = getClient();
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-image',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: options.imageUrl } },
            ...(options.maskImageUrl ? [{
              type: 'image_url',
              image_url: { url: options.maskImageUrl },
            }, {
              type: 'text',
              text: `Edite esta imagem usando a máscara fornecida (região branca) com a instrução: ${options.instructions}. Altere APENAS a região da máscara. Preserve rigorosamente o restante da imagem.`,
            }] : [{
              type: 'text',
              text: `Edite esta imagem com a seguinte instrução: ${options.instructions}. Preserve rigorosamente todo o resto da imagem. Altere APENAS o que foi pedido.`,
            }]),
          ],
        }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new AppError(502, 'IMAGE_EDIT_ERROR', `Image edit error: ${err}`);
    }

    try {
      return await persistOpenRouterImageResponse(response);
    } catch (err) {
      throw new AppError(502, 'IMAGE_EDIT_EMPTY', (err as Error).message || 'Modelo não retornou imagem editada.');
    }
  },
};
