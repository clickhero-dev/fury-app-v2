export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum CreativeType {
  IMAGE = 'image',
  VIDEO = 'video',
  COPY = 'copy',
}

export enum ComplianceStatus {
  PENDING = 'pending',
  PENDING_COMPLIANCE = 'pending_compliance',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

// ── Estúdio de Criação ────────────────────────────────────────────────────────

export const CREATIVE_LAYOUTS = [
  'editorial_headline',
  'offer_burst',
  'split_diagonal_product',
  'photo_immersive',
  'split_horizontal_photo',
] as const;

export type CreativeLayout = (typeof CREATIVE_LAYOUTS)[number];

// Estágio do funil de marketing de cada arquétipo
export const CREATIVE_LAYOUT_FUNNEL_STAGE: Record<CreativeLayout, 'TOFU' | 'MOFU' | 'BOFU'> = {
  editorial_headline:     'TOFU',
  offer_burst:            'BOFU',
  split_diagonal_product: 'BOFU',
  photo_immersive:        'MOFU',
  split_horizontal_photo: 'MOFU',
};

// Nomes amigáveis para exibição na UI — nunca exibir os nomes técnicos ao usuário
export const CREATIVE_LAYOUT_LABELS: Record<CreativeLayout, string> = {
  editorial_headline:     'Manchete editorial',
  offer_burst:            'Oferta de alto impacto',
  split_diagonal_product: 'Vitrine de produto',
  photo_immersive:        'Foto imersiva',
  split_horizontal_photo: 'Apresentação institucional',
};

// Campos obrigatórios por arquétipo — usado para validação no wizard (Prompt 5)
export const CREATIVE_LAYOUT_REQUIRED_FIELDS: Record<CreativeLayout, string[]> = {
  editorial_headline:     ['headline', 'subheadline', 'background_image_url'],
  offer_burst:            ['headline', 'offer_text', 'hero_image_url'],
  split_diagonal_product: ['headline', 'benefits', 'product_image_url', 'cta'],
  photo_immersive:        ['qualifier', 'headline', 'cta', 'background_image_url'],
  split_horizontal_photo: ['qualifier', 'headline', 'cta', 'background_image_url'],
};
