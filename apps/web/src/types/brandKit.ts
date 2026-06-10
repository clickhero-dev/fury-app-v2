export type VoiceTone = 'professional' | 'casual' | 'urgent' | 'premium';

export interface BrandKit {
  id: string;
  tenant_id: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  voice_tone: VoiceTone | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface SaveBrandKitPayload {
  primary_color?: string;
  secondary_color?: string;
  voice_tone?: VoiceTone;
  logo_url?: string | null;
  photo_urls?: string[];
}

export interface BrandKitApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}
