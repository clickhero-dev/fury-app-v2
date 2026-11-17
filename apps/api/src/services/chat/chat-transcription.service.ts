import { runWithTenant } from '../../lib/ai-key-context.js';
import type { ChatMediaValidator, MediaInput } from './chat-media-validator.js';
import type { OpenRouterChatMediaClient } from './openrouter-chat-media.client.js';

export class ChatTranscriptionService {
  constructor(private readonly validator: ChatMediaValidator, private readonly provider: Pick<OpenRouterChatMediaClient, 'transcribe'>) {}
  async transcribe(tenantId: string, audio: MediaInput, signal?: AbortSignal): Promise<{ text: string }> {
    const normalized = await this.validator.audio(audio);
    if (normalized.silent) return { text: '' };
    // Multer can lose AsyncLocalStorage context: resolve the OWNER key inside this explicit scope.
    return runWithTenant(tenantId, async () => ({ text: await this.provider.transcribe(normalized.buffer, signal) }));
  }
}
