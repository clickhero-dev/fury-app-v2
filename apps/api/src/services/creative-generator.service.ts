// Contrato central do Estúdio de Criação.
// Define os 5 arquétipos visuais e os campos de copy/imagem/marca consumidos
// pelo renderer (html-to-png.service.ts) e pelo pipeline de geração.
//
// Histórico: o gerador de HTML legado (generateCreativeHTML + layouts
// product_hero/text_focus/offer_highlight/testimonial_style) foi removido em
// 15/06/2026 — era código morto (nenhum importador) e incompatível com o novo
// contrato. A renderização é feita por @napi-rs/canvas em html-to-png.service.ts.

export interface CreativeData {
  // ── Layout ───────────────────────────────────────────────────────────
  layout: 'editorial_headline'
        | 'offer_burst'
        | 'split_diagonal_product'
        | 'photo_immersive'
        | 'split_horizontal_photo';

  // ── Textos principais ────────────────────────────────────────────────
  headline: string;
  subheadline?: string;         // obrigatório em editorial_headline
  qualifier?: string;           // obrigatório em photo_immersive e split_horizontal_photo
  offer_text?: string;          // obrigatório em offer_burst (máx 8 chars)
  subtitle?: string;            // offer_burst: texto de apoio abaixo do badge
  subtitle_highlight?: string;  // offer_burst: substring do subtitle a destacar em accent

  // ── Benefícios ───────────────────────────────────────────────────────
  benefits?: string[];          // split_diagonal_product: obrigatório (2-4 itens)

  // ── CTA ──────────────────────────────────────────────────────────────
  cta?: string;                 // ausente em editorial_headline (sem CTA visual)
  cta_icon?: 'arrow' | 'phone' | 'whatsapp' | 'none';

  // ── Preço ────────────────────────────────────────────────────────────
  price_text?: string;          // opcional em split_diagonal_product

  // ── Imagens ──────────────────────────────────────────────────────────
  background_image_url?: string;  // editorial_headline, photo_immersive, split_horizontal_photo
  product_image_url?: string;     // split_diagonal_product (mockup)
  hero_image_url?: string;        // offer_burst (PNG com fundo transparente)

  // ── Tom e cores por layout ───────────────────────────────────────────
  tone?: 'institutional' | 'energetic'; // split_horizontal_photo
  top_zone_color?: string;               // split_horizontal_photo: override opcional
  highlight_color?: string;              // editorial_headline: override da cor da manchete

  // ── Marca ────────────────────────────────────────────────────────────
  businessName: string;
  includeLogo?: boolean;        // default true
  brand_colors: {
    primary: string;            // #hex, obrigatório
    accent?: string;            // #hex, opcional
    dark?: string;              // #hex, opcional — usado em split_diagonal_product
  };

  // ── Campos legados (backward compat com assets antigos em complianceNotes) ──
  // NÃO usar em novos criativos. Existem apenas para que JSONs antigos
  // continuem parseando sem erro de tipo no runtime.
  /** @deprecated use subtitle */
  primary_text?: string;
  /** @deprecated color_scheme foi removido — cores vêm de brand_colors */
  color_scheme?: string;
  /** @deprecated use product_image_url */
  productImageUrl?: string;
}
