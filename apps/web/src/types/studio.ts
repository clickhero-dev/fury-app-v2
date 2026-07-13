import type { CreativeLayout } from '@/lib/layout-labels';

/** Asset criativo gerado ou importado no Estúdio. */
export interface StudioAsset {
  id: string;
  type: 'image' | 'copy' | 'video';
  /** URL do asset no Cloudflare R2. Null para assets do tipo copy. */
  url: string | null;
  /** Status de análise de compliance das políticas de anúncio da Meta. */
  complianceStatus: 'pending' | 'pending_compliance' | 'approved' | 'rejected';
  name?: string;
  title?: string;
  headline?: string;
  description?: string;
  primaryText?: string;
  createdAt?: string;
  /** Notas do sistema de compliance explicando reprovações. */
  complianceNotes?: string | null;
  /** ID do asset registrado no Meta Ads após publicação. */
  metaAssetId?: string | null;
}

/** Payload para geração de imagem via DALL-E 3. */
export interface GenerateImagePayload {
  prompt: string;
  format: 'feed' | 'stories' | 'banner';
  style: 'photographic' | 'illustration' | 'minimalist';
}

/** Resposta da API após geração de imagem. */
export interface GenerateImageResponse {
  id: string;
  url: string;
  format: string;
  style: string;
  prompt: string;
  createdAt: string;
}

/** Resposta da API após geração de criativo no Estúdio (antes do compliance). */
export interface StudioImageGenerationResponse {
  creativeAssetId: string;
  imageUrl: string;
  prompt: string;
  generatedAt: string;
  /** Assets ficam em pending_compliance até a análise automática ser concluída. */
  status: 'pending_compliance';
}

/** Resposta da API com o resultado da análise de compliance de um asset. */
export interface StudioComplianceStatusResponse {
  assetId: string;
  tenantId: string;
  imageUrl: string;
  complianceStatus: StudioAsset['complianceStatus'];
  complianceNotes: string | null;
  approved: boolean | null;
  /** Lista de problemas encontrados (ex: texto excessivo, conteúdo proibido). */
  issues: string[];
  /** Percentual de área da imagem coberta por texto (Meta limita a 20%). */
  textPercentage: number | null;
  metaAssetId: string | null;
  createdAt: string;
}

/** Resposta da API após publicação de um asset no Meta Ads. */
export interface StudioPublishResponse {
  hash: string;
  imageUrl: string;
  metaAssetId: string;
  /** URL do Ads Manager para visualizar o asset publicado. */
  adsManagerUrl: string;
}

/** Template de prompt pré-configurado para geração rápida no Estúdio. */
export interface StudioTemplate {
  id: string;
  label: string;
  niche: string;
  prompt: string;
}

/** Variação de copy gerada pelo Estúdio com pontuação de qualidade. */
export interface CopyVariacao {
  texto: string;
  caracteres: number;
  /** Pontuação de 0 a 10 baseada em limites de caracteres e boas práticas. */
  pontuacao: number;
}

/** Tipo de copy para geração no Estúdio Criativo. */
export type CopyType = 'headline' | 'descricao' | 'cta' | 'completo';

/** Tom de comunicação para geração de copies. */
export type CopyTone = 'formal' | 'casual' | 'urgente' | 'emocional';

/** Payload para geração de copy via `POST /studio/generate-copy`. */
export interface GenerateCopyPayload {
  type: CopyType;
  produto: string;
  publico: string;
  objetivo: string;
  tom: CopyTone;
  quantidadeVariacoes: 3 | 4 | 5;
}

/** Resposta da API com as variações de copy geradas. */
export interface GenerateCopyResponse {
  variacoes: CopyVariacao[];
}

/** Payload para renderização de criativo com dados de marca. */
export interface RenderCreativePayload {
  headline: string;
  cta: string;
  brandColor: string;
  imageUrl: string;
  includeLogo?: boolean;
}

/** Resposta da API após renderização de criativo. */
export interface RenderCreativeResponse {
  creativeAssetId: string;
  imageUrl: string;
  headline: string;
  cta: string;
  brandColor: string;
}

/**
 * Campos de copy sugeridos pelo LLM após seleção de layout.
 * Todos opcionais — o usuário pode aceitar, editar ou ignorar cada sugestão.
 */
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

/** Campos de copy curados pelo usuário e enviados ao backend para geração do criativo. */
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

/** Payload completo para geração de criativo via `POST /studio/generate`. */
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

/** Payload para preview PNG fiel do criativo antes da geração final. */
export interface PreviewCreativePayload extends CreativeCopyFields {
  layout: CreativeLayout;
  productImageUrl?: string;
  includeLogo?: boolean;
}

/** Payload para seleção automática de layout pelo LLM. */
export interface SelectLayoutPayload {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
  hasProductImage: boolean;
  productImageUrl?: string;
}

/** Resposta da API com o layout recomendado pelo LLM e campos sugeridos. */
export interface SelectLayoutResponse {
  layout: CreativeLayout;
  label: string;
  funnel_stage: 'TOFU' | 'MOFU' | 'BOFU';
  /** Nível de confiança do LLM na recomendação (0 a 1). */
  confidence: number;
  /** Justificativa do LLM para a escolha do layout. */
  justification: string;
  suggested_fields: SuggestedFields;
}

/** Pergunta adaptativa gerada quando o contexto fornecido é insuficiente. */
export interface AdaptiveQuestion {
  id: string;
  question: string;
  placeholder: string;
  /** Campo do payload que esta pergunta visa preencher. */
  field: string;
}

/** Payload para validação de contexto antes da geração do criativo. */
export interface ValidateContextPayload {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
}

/** Resposta da validação de contexto. */
export interface ValidateContextResponse {
  /** `true` se o contexto é suficiente para gerar o criativo sem perguntas adicionais. */
  sufficient: boolean;
  /** Campos faltantes identificados pelo LLM. */
  missing: string[];
  /** Perguntas adaptativas geradas quando `sufficient = false`. */
  questions?: AdaptiveQuestion[];
}

/** Resposta da API após geração completa de um criativo. */
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
    /** Campos legados presentes em assets antigos na biblioteca. */
    primary_text?: string;
    color_scheme?: string;
  };
}