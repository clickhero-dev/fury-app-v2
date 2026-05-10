export interface StudioAsset {
  id: string;
  type: 'image' | 'copy' | 'video';
  url: string | null;
  compliance_status: 'pending' | 'approved' | 'rejected';
  name: string;
  createdAt?: string;
  description?: string;
}

export interface GenerateImagePayload {
  prompt: string;
  format: 'feed' | 'stories' | 'banner';
  style: 'photographic' | 'illustration' | 'minimalist';
}

export interface GenerateImageResponse {
  id: string;
  url: string;
  format: string;
  style: string;
  prompt: string;
  createdAt: string;
}
