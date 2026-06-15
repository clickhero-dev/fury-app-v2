// Dicionário central de linguagem de produto para os 5 arquétipos.
// REGRA: o código usa os nomes técnicos; a UI usa SEMPRE os nomes amigáveis
// daqui. Nenhum nome técnico (offer_burst, etc.) deve aparecer na tela.

export type CreativeLayout =
  | 'editorial_headline'
  | 'offer_burst'
  | 'split_diagonal_product'
  | 'photo_immersive'
  | 'split_horizontal_photo';

export const CREATIVE_LAYOUTS: CreativeLayout[] = [
  'editorial_headline',
  'offer_burst',
  'split_diagonal_product',
  'photo_immersive',
  'split_horizontal_photo',
];

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

// Estágio do funil em linguagem de produto (nunca "TOFU/BOFU" na tela).
export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  TOFU: 'Atração de clientes',
  MOFU: 'Consideração',
  BOFU: 'Conversão',
};

export type FieldKey =
  | 'headline'
  | 'subheadline'
  | 'qualifier'
  | 'offer_text'
  | 'subtitle'
  | 'subtitle_highlight'
  | 'benefits'
  | 'cta'
  | 'price_text'
  | 'tone';

export interface LayoutFieldSpec {
  key: FieldKey;
  label: string;
  kind: 'text' | 'textarea' | 'list' | 'tone';
  maxLength?: number;
  itemMaxLength?: number;
  maxItems?: number;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface LayoutMeta {
  label: string;
  funnelStage: FunnelStage;
  whenToUse: string;
  needsImage: boolean;
  needsLogo: boolean;
  fields: LayoutFieldSpec[];
}

export const LAYOUT_META: Record<CreativeLayout, LayoutMeta> = {
  editorial_headline: {
    label: 'Manchete editorial',
    funnelStage: 'TOFU',
    whenToUse: 'Para gerar curiosidade e autoridade — ideal quando você quer ensinar ou alertar sobre um tema, sem venda direta.',
    needsImage: true,
    needsLogo: false,
    fields: [
      { key: 'headline', label: 'Manchete', kind: 'textarea', maxLength: 110, placeholder: 'Uma frase de impacto, estilo manchete de jornal' },
      { key: 'subheadline', label: 'Texto de apoio', kind: 'textarea', maxLength: 160, placeholder: 'Complemento que dá contexto e autoridade' },
    ],
  },
  offer_burst: {
    label: 'Oferta de alto impacto',
    funnelStage: 'BOFU',
    whenToUse: 'Para uma oferta forte (desconto, brinde, preço) que precisa chamar atenção imediata.',
    needsImage: false,
    needsLogo: false,
    fields: [
      { key: 'headline', label: 'Título', kind: 'text', maxLength: 60, placeholder: 'Título curto e direto' },
      { key: 'offer_text', label: 'Oferta em destaque', kind: 'text', maxLength: 8, placeholder: '50% OFF', hint: 'Bem curto: "50% OFF", "GRÁTIS", "R$49"' },
      { key: 'subtitle', label: 'Texto de apoio', kind: 'text', maxLength: 60, optional: true, placeholder: 'Frase de reforço abaixo da oferta' },
      { key: 'subtitle_highlight', label: 'Palavra em destaque', kind: 'text', maxLength: 30, optional: true, hint: 'Trecho do texto de apoio que recebe a cor de destaque' },
      { key: 'cta', label: 'Botão', kind: 'text', maxLength: 24, optional: true, placeholder: 'Compre agora' },
    ],
  },
  split_diagonal_product: {
    label: 'Vitrine de produto',
    funnelStage: 'BOFU',
    whenToUse: 'Para mostrar um produto (físico ou digital) com seus principais benefícios e preço.',
    needsImage: true,
    needsLogo: false,
    fields: [
      { key: 'headline', label: 'Título', kind: 'text', maxLength: 30, placeholder: 'Nome curto do produto' },
      { key: 'benefits', label: 'Benefícios', kind: 'list', itemMaxLength: 60, maxItems: 4, placeholder: 'Um benefício por linha' },
      { key: 'cta', label: 'Botão', kind: 'text', maxLength: 24, placeholder: 'Quero o meu' },
      { key: 'price_text', label: 'Preço', kind: 'text', maxLength: 20, optional: true, placeholder: 'R$ 27' },
    ],
  },
  photo_immersive: {
    label: 'Foto imersiva',
    funnelStage: 'MOFU',
    whenToUse: 'Para negócios locais: uma foto bonita do seu espaço ou produto que faz a pessoa querer conhecer.',
    needsImage: true,
    needsLogo: true,
    fields: [
      { key: 'qualifier', label: 'Chamada', kind: 'text', maxLength: 40, placeholder: 'Oferta ou qualificador curto' },
      { key: 'headline', label: 'Nome do negócio', kind: 'text', maxLength: 24, placeholder: 'Identidade do negócio' },
      { key: 'cta', label: 'Botão', kind: 'text', maxLength: 18, placeholder: 'Reserve agora' },
    ],
  },
  split_horizontal_photo: {
    label: 'Apresentação institucional',
    funnelStage: 'MOFU',
    whenToUse: 'Apresentação sóbria e profissional do seu negócio, com foto e identidade.',
    needsImage: true,
    needsLogo: true,
    fields: [
      { key: 'qualifier', label: 'Chamada', kind: 'text', maxLength: 45, placeholder: 'Frase de apresentação' },
      { key: 'headline', label: 'Nome do negócio', kind: 'text', maxLength: 30, placeholder: 'Identidade do negócio' },
      { key: 'cta', label: 'Botão', kind: 'text', maxLength: 18, placeholder: 'Agende uma visita' },
      { key: 'tone', label: 'Tom', kind: 'tone' },
    ],
  },
};

export function layoutLabel(layout: string): string {
  return (LAYOUT_META as Record<string, LayoutMeta>)[layout]?.label ?? 'Modelo descontinuado';
}

export function isKnownLayout(layout: string): layout is CreativeLayout {
  return layout in LAYOUT_META;
}

// Defesa em profundidade: mesmo que o LLM escape a instrução do prompt, a UI
// nunca exibe o nome técnico do arquétipo — troca por nome de produto.
export function sanitizeJustification(text: string): string {
  let out = text;
  for (const layout of CREATIVE_LAYOUTS) {
    out = out.replace(new RegExp(layout, 'gi'), LAYOUT_META[layout].label);
  }
  return out;
}
