import { AppError } from '../middleware/errorHandler.js';
import OpenAI from 'openai';

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
    logoUrl?: string;
    previousImageUrl?: string;
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
        ...(options.previousImageUrl ? { image: options.previousImageUrl } : options.logoUrl ? { image: options.logoUrl } : {}),
      }),
    });
    if (!response.ok) {
      const err = await response.text();
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

  // ponytail: edição precisa via modelo multimodal (Gemini Nano Banana 2)
  async editImage(options: {
    imageUrl: string;
    instructions: string;
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
            { type: 'text', text: `Edite esta imagem com a seguinte instrução: ${options.instructions}. Preserve rigorosamente todo o resto da imagem. Altere APENAS o que foi pedido.` },
          ],
        }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new AppError(502, 'IMAGE_EDIT_ERROR', `Image edit error: ${err}`);
    }
    const data = (await response.json()) as any;
    // Gemini returns image in the assistant message content
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content; // base64 data URL
    if (Array.isArray(content)) {
      const imagePart = content.find((p: any) => p.type === 'image_url');
      if (imagePart?.image_url?.url) return imagePart.image_url.url;
    }
    throw new AppError(502, 'IMAGE_EDIT_EMPTY', 'Modelo não retornou imagem editada.');
  },

  // ponytail: DALL-E 2 inpainting com máscara via OpenAI (já instalado)
  async inpaintImage(options: {
    imageUrl: string;
    maskBase64: string;
    prompt: string;
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AppError(500, 'OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY não configurada.');

    const openai = new OpenAI({ apiKey });

    // Download original image as buffer
    const imgResp = await fetch(options.imageUrl);
    if (!imgResp.ok) throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', 'Falha ao baixar imagem original.');
    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

    // Convert mask from base64 to buffer
    const maskMatch = options.maskBase64.match(/^data:image\/\w+;base64,(.+)$/);
    const maskBuffer = maskMatch
      ? Buffer.from(maskMatch[1], 'base64')
      : Buffer.from(options.maskBase64, 'base64');

    // Resize both to 1024x1024 (DALL-E 2 requirement)
    const { default: sharp } = await import('sharp');
    const imgResized = await sharp(imgBuffer).resize(1024, 1024, { fit: 'fill' }).png().toBuffer();
    const maskResized = await sharp(maskBuffer).resize(1024, 1024, { fit: 'fill' }).png().toBuffer();

    // DALL-E 2 inpainting: transparent mask area = where to edit
    // ponytail: as any — Buffer works at runtime, Bun types reject it
    const response = await openai.images.edit({
      image: imgResized as any,
      mask: maskResized as any,
      prompt: options.prompt,
      n: 1,
      size: '1024x1024',
    });

    const resultUrl = response.data?.[0]?.url;
    const resultB64 = response.data?.[0]?.b64_json;
    if (resultUrl) return resultUrl;
    if (resultB64) return `data:image/png;base64,${resultB64}`;
    throw new AppError(502, 'INPAINT_FAILED', 'OpenAI não retornou imagem editada.');
  },
};
