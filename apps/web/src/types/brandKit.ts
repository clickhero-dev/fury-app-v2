/** Tom de voz da marca para geração de copies no Estúdio Criativo. */
export type VoiceTone = 'professional' | 'casual' | 'urgent' | 'premium';

/** Brand kit completo da organização. */
export interface BrandKit {
  id: string;
  tenant_id: string;
  /** URL do logotipo armazenado no Cloudflare R2. */
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  voice_tone: VoiceTone | null;
  /** URLs das fotos da organização armazenadas no R2. */
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

/** Payload para criação ou atualização parcial do brand kit. Todos os campos são opcionais. */
export interface SaveBrandKitPayload {
  primary_color?: string;
  secondary_color?: string;
  voice_tone?: VoiceTone;
  logo_url?: string | null;
  photo_urls?: string[];
}

/** Envelope padrão das respostas da API de brand kit. */
export interface BrandKitApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}