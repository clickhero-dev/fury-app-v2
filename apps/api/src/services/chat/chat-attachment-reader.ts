import { z } from 'zod';
import { runWithTenant } from '../../lib/ai-key-context.js';
import type { ValidatedMedia } from './chat-media-validator.js';
import { type OpenRouterChatMediaClient, mediaProviderError } from './openrouter-chat-media.client.js';

const evidence = z.object({
  content: z.string().trim().min(1).max(10000),
  references: z.array(z.object({ text: z.string().min(1).max(500), page: z.number().int().positive().optional(), seconds: z.number().nonnegative().optional() }).strict()).max(30),
  limitations: z.array(z.string().max(500)).max(10),
}).strict();

export class ChatAttachmentReader {
  constructor(private readonly provider: Pick<OpenRouterChatMediaClient, 'read'>) {}
  async read(tenantId: string, media: ValidatedMedia, bytes: Buffer, question: string, signal?: AbortSignal): Promise<string> {
    const raw = await runWithTenant(tenantId, () => this.provider.read(media, bytes, question, signal));
    try {
      const result = evidence.parse(JSON.parse(raw));
      const references = result.references.map(reference => {
        if (reference.page !== undefined && (!media.metadata.pageCount || reference.page > media.metadata.pageCount)) throw mediaProviderError();
        if (reference.seconds !== undefined && (!media.metadata.durationSeconds || reference.seconds > media.metadata.durationSeconds)) throw mediaProviderError();
        return reference.page !== undefined ? `Página ${reference.page}: ${reference.text}` : reference.seconds !== undefined ? `${reference.seconds}s: ${reference.text}` : reference.text;
      });
      const limitations = [...result.limitations, 'Leitura multimodal automatizada: detalhes podem não ter sido identificados.'];
      if (media.mimeType.startsWith('video/')) {
        limitations.push('Vídeo interpretado por amostragem do provedor; não equivale a inspeção de todos os quadros.');
        if (!media.metadata.hasAudio) limitations.push('Arquivo sem faixa de áudio; nenhuma fala foi transcrita.');
      }
      return `${result.content}\n${references.join('\n')}\nLimitações: ${limitations.join(' ')}`.slice(0, 12000);
    } catch { throw mediaProviderError(); }
  }
}
