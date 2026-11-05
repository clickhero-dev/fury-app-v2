import { AppError } from '../../middleware/errorHandler.js';
import type { ChatMessage } from '../llms/openrouter.service.js';
import type { StudioRepository } from '../../repository/studio.repository.js';

const MODELS = ['nvidia/nemotron-nano-12b-v2-vl:free', 'google/gemini-2.5-flash-lite'];
const UNAVAILABLE = 'Não foi possível gerar a legenda. Tente novamente ou escreva manualmente.';

type ChatClient = {
  chat(messages: ChatMessage[], options?: { model?: string; temperature?: number; max_tokens?: number; response_format?: { type: 'json_object' }; timeoutMs?: number }): Promise<string>;
};

export type CaptionSuggestion = { caption: string; imageUsed: boolean };

function parseCaption(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { caption?: unknown };
    const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
    return caption && caption.length <= 5000 ? caption : null;
  } catch { return null; }
}

/** Geração síncrona e transitória; não persiste posts nem a sugestão. */
export class PlannerCaptionSuggestionService {
  constructor(
    private readonly llm: ChatClient,
    private readonly studioRepositoryFor: (tenantId: string) => Pick<StudioRepository, 'findAssetByUrl'>,
  ) {}

  async suggest(tenantId: string, input: { context?: string; imageUrl?: string }): Promise<CaptionSuggestion> {
    const context = input.context?.trim() ?? '';
    let imageUrl: string | undefined;
    if (input.imageUrl) {
      const asset = await this.studioRepositoryFor(tenantId).findAssetByUrl(input.imageUrl);
      if (asset?.type === 'image' && input.imageUrl.startsWith('https://')) imageUrl = input.imageUrl;
      else if (!context) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Mídia não encontrada');
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Você escreve legendas para redes sociais. Responda somente JSON válido no formato {"caption":"..."}. Escreva em português brasileiro, com uma legenda social completa, natural e pronta para edição. Máximo de 5000 caracteres.' },
      { role: 'user', content: imageUrl
        ? [{ type: 'text', text: context ? `Tema informado: ${context}` : 'Crie uma legenda contextual para esta imagem.' }, { type: 'image_url', image_url: { url: imageUrl } }]
        : `Tema informado: ${context}` },
    ];
    for (const model of MODELS) {
      try {
        const caption = parseCaption(await this.llm.chat(messages, { model, max_tokens: 1024, response_format: { type: 'json_object' }, timeoutMs: 20_000 }));
        if (caption) return { caption, imageUsed: Boolean(imageUrl) };
      } catch { /* tenta o modelo seguinte sem vazar erro do provedor */ }
    }
    throw new AppError(503, 'CAPTION_SUGGESTION_UNAVAILABLE', UNAVAILABLE);
  }
}

export { UNAVAILABLE as CAPTION_SUGGESTION_UNAVAILABLE_MESSAGE };
