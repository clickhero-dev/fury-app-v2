/**
 * Dicionário central de linguagem de produto para os 5 arquétipos de layout criativo.
 *
 * REGRA DE USO: o código usa os nomes técnicos (ex: 'offer_burst') internamente,
 * mas a UI exibe SEMPRE os nomes amigáveis definidos aqui.
 * Nenhum nome técnico deve aparecer na tela para o usuário.
 */

/** Identificadores técnicos dos layouts criativos disponíveis no Estúdio. */
export type CreativeLayout =
  | 'editorial_headline'
  | 'offer_burst'
  | 'split_diagonal_product'
  | 'photo_immersive'
  | 'split_horizontal_photo';

/** Lista ordenada de todos os layouts disponíveis. */
export const CREATIVE_LAYOUTS: CreativeLayout[] = [
  'editorial_headline',
  'offer_burst',
  'split_diagonal_product',
  'photo_immersive',
  'split_horizontal_photo',
];

/** Estágio do funil de marketing. */
export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

/**
 * Labels amigáveis para os estágios do funil.
 * Nunca exibir os termos técnicos (TOFU/MOFU/BOFU) na interface.
 */
export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  TOFU: 'Atração de clientes',
  MOFU: 'Consideração',
  BOFU: 'Conversão',
};

/** Chaves dos campos editáveis nos layouts criativos. */
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

/** Especificação de um campo editável em um layout criativo. */
export interface LayoutFieldSpec {
  key: FieldKey;
  label: string;
  /** Tipo do campo: texto simples, área de texto, lista de itens ou seletor de tom. */
  kind: 'text' | 'textarea' | 'list' | 'tone';
  maxLength?: number;
  itemMaxLength?: number;
  maxItems?: number;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
}

/** Metadados completos de um layout criativo. */
export interface LayoutMeta {
  /** Nome amigável exibido na UI. */
  label: string;
  /** Estágio do funil para o qual o layout é mais adequado. */
  funnelStage: FunnelStage;
  /** Orientação sobre quando usar este layout. */
  whenToUse: string;
  /** Se o layout requer uma imagem de produto/background. */
  needsImage: boolean;
  /** Se o layout requer o logo da marca. */
  needsLogo: boolean;
  /** Campos editáveis do layout em ordem de exibição. */
  fields: LayoutFieldSpec[];
}

/**
 * Mapa completo de metadados para cada layout criativo.
 * Fonte única de verdade para configuração dos layouts no Estúdio Criativo.
 */
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

/**
 * Retorna o label amigável de um layout a partir do seu identificador técnico.
 * Retorna 'Modelo descontinuado' para layouts não reconhecidos.
 *
 * @param layout - Identificador técnico do layout
 * @returns Nome amigável do layout
 *
 * @example
 * layoutLabel('offer_burst')    // → 'Oferta de alto impacto'
 * layoutLabel('layout_antigo')  // → 'Modelo descontinuado'
 */
export function layoutLabel(layout: string): string {
  return (LAYOUT_META as Record<string, LayoutMeta>)[layout]?.label ?? 'Modelo descontinuado';
}

/**
 * Verifica se uma string é um identificador válido de layout criativo.
 * Útil para type narrowing em código que recebe layouts como string genérica.
 *
 * @param layout - String a verificar
 * @returns `true` se o layout existe em `LAYOUT_META`
 *
 * @example
 * if (isKnownLayout(layout)) {
 *   // layout é do tipo CreativeLayout aqui
 * }
 */
export function isKnownLayout(layout: string): layout is CreativeLayout {
  return layout in LAYOUT_META;
}

/**
 * Substitui nomes técnicos de layouts por seus labels amigáveis em um texto.
 * Usada como defesa em profundidade: mesmo que o LLM ignore a instrução do prompt,
 * nenhum nome técnico aparece na interface.
 *
 * @param text - Texto gerado pelo LLM que pode conter nomes técnicos
 * @returns Texto com nomes técnicos substituídos por labels de produto
 *
 * @example
 * sanitizeJustification('Use offer_burst para promoções')
 * // → 'Use Oferta de alto impacto para promoções'
 */
export function sanitizeJustification(text: string): string {
  let out = text;
  for (const layout of CREATIVE_LAYOUTS) {
    out = out.replace(new RegExp(layout, 'gi'), LAYOUT_META[layout].label);
  }
  return out;
}