export interface StudioAsset {
  id: string;
  type: 'image' | 'copy' | 'video';
  url: string | null;
  complianceStatus: 'pending' | 'pending_compliance' | 'approved' | 'rejected';
  name?: string;
  createdAt?: string;
  description?: string;
  complianceNotes?: string | null;
  metaAssetId?: string | null;
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

export interface StudioImageGenerationResponse {
  creativeAssetId: string;
  imageUrl: string;
  prompt: string;
  generatedAt: string;
  status: 'pending_compliance';
}

export interface StudioComplianceStatusResponse {
  assetId: string;
  tenantId: string;
  imageUrl: string;
  complianceStatus: StudioAsset['complianceStatus'];
  complianceNotes: string | null;
  approved: boolean | null;
  issues: string[];
  textPercentage: number | null;
  metaAssetId: string | null;
  createdAt: string;
}

export interface StudioPublishResponse {
  hash: string;
  imageUrl: string;
  metaAssetId: string;
  adsManagerUrl: string;
}

export interface StudioTemplate {
  id: string;
  label: string;
  niche: string;
  prompt: string;
}

export interface CopyVariacao {
  texto: string;
  caracteres: number;
  pontuacao: number;
}

export type CopyType = 'headline' | 'descricao' | 'cta' | 'completo';
export type CopyTone = 'formal' | 'casual' | 'urgente' | 'emocional';

export interface GenerateCopyPayload {
  type: CopyType;
  produto: string;
  publico: string;
  objetivo: string;
  tom: CopyTone;
  quantidadeVariacoes: 3 | 4 | 5;
}

export interface GenerateCopyResponse {
  variacoes: CopyVariacao[];
}

export interface RenderCreativePayload {
  headline: string;
  cta: string;
  brandColor: string;
  imageUrl: string;
}

export interface RenderCreativeResponse {
  creativeAssetId: string;
  imageUrl: string;
}
