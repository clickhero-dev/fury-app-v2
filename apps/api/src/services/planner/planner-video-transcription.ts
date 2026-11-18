import type { ChatMediaValidator } from '../chat/chat-media-validator.js';
import type { OpenRouterChatMediaClient } from '../chat/openrouter-chat-media.client.js';

/** Adaptador de mídia; autorização tenant-scoped é responsabilidade do serviço chamador. */
export class PlannerVideoTranscription {
  constructor(
    private readonly read: (url: string) => Promise<Buffer>,
    private readonly validator: Pick<ChatMediaValidator, 'videoAudio'>,
    private readonly provider: Pick<OpenRouterChatMediaClient, 'transcribe'>,
  ) {}
  async transcribe(url: string): Promise<string> {
    const audio = await this.validator.videoAudio({ buffer: await this.read(url), originalname: 'video.mp4' });
    return audio ? this.provider.transcribe(audio) : '';
  }
}
