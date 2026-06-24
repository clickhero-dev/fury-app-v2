export interface StudioAsset {
  id: string;
  type: 'image' | 'copy' | 'video';
  url: string | null;
  complianceStatus: 'pending' | 'pending_compliance' | 'approved' | 'rejected';
  name?: string;
  title?: string;
  headline?: string;
  description?: string;
  primaryText?: string;
  createdAt?: string;
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
  headline: string;
  cta: string;
  brandColor: string;
}

import type { CreativeLayout } from '@/lib/layout-labels';

export interface SuggestedFields {
  headline?: string;
  subheadline?: string;
  qualifier?: string;
  offer_text?: string;
  subtitle?: string;
  subtitle_highlight?: string;
  benefits?: string[];
  cta?: string;
  tone?: 'institutional' | 'energetic';
}

// Campos de copy enviados ao backend (curados pelo usuário).
export interface CreativeCopyFields {
  headline?: string;
  subheadline?: string;
  qualifier?: string;
  offer_text?: string;
  subtitle?: string;
  subtitle_highlight?: string;
  benefits?: string[];
  cta?: string;
  cta_icon?: 'arrow' | 'phone' | 'whatsapp' | 'none';
  price_text?: string;
  tone?: 'institutional' | 'energetic';
}

export interface GenerateCreativePayload extends CreativeCopyFields {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
  hasProductImage: boolean;
  productImageUrl?: string;
  background_image_url?: string;
  product_image_url?: string;
  hero_image_url?: string;
  layout?: CreativeLayout;
  includeLogo?: boolean;
  skipCopy?: boolean;
  adaptiveAnswers?: Record<string, string>;
}

// Payload do preview fiel (POST /studio/preview-png → PNG).
export interface PreviewCreativePayload extends CreativeCopyFields {
  layout: CreativeLayout;
  productImageUrl?: string;
  includeLogo?: boolean;
}

export interface SelectLayoutPayload {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
  hasProductImage: boolean;
  productImageUrl?: string;
}

export interface SelectLayoutResponse {
  layout: CreativeLayout;
  label: string;
  funnel_stage: 'TOFU' | 'MOFU' | 'BOFU';
  confidence: number;
  justification: string;
  suggested_fields: SuggestedFields;
}

export interface AdaptiveQuestion {
  id: string;
  question: string;
  placeholder: string;
  field: string;
}

export interface ValidateContextPayload {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
}

export interface ValidateContextResponse {
  sufficient: boolean;
  missing: string[];
  questions?: AdaptiveQuestion[];
}

export interface GenerateCreativeResponse {
  type?: 'image' | 'video';
  assetId: string;
  imageUrl: string;
  videoUrl?: string;
  creativeData: {
    layout?: string;
    headline?: string;
    subheadline?: string;
    qualifier?: string;
    offer_text?: string;
    subtitle?: string;
    subtitle_highlight?: string;
    benefits?: string[];
    cta?: string;
    // legados (assets antigos na biblioteca)
    primary_text?: string;
    color_scheme?: string;
  };
}
