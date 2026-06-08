export interface CreativeContext {
  product: string;
  promise: string;
  offer?: string;
  audience: string;
  hasProductImage: boolean;
  productImageUrl?: string;
  businessName: string;
  objective: string;
  tone?: string;
}

export function buildCreativePrompt(context: CreativeContext): string {
  return `Você é um especialista em criativos de alta performance para Meta Ads no mercado brasileiro.

Com base no contexto abaixo, gere um criativo de anúncio completo.

NEGÓCIO: ${context.businessName}
OBJETIVO: ${context.objective}
O QUE SERÁ ANUNCIADO: ${context.product}
PROMESSA: ${context.promise}
${context.offer ? `OFERTA: ${context.offer}` : ''}
PÚBLICO: ${context.audience}
TOM DE VOZ: ${context.tone || 'profissional e direto'}
${context.hasProductImage ? 'O usuário forneceu imagem do produto — posicione-a como elemento principal.' : ''}

Responda SOMENTE em JSON válido com esta estrutura exata:
{
  "headline": "texto impactante com máximo 40 caracteres",
  "primary_text": "texto principal do anúncio com máximo 125 caracteres, focado na promessa",
  "cta": "um de: Saiba Mais | Comprar Agora | Cadastre-se | Falar com Especialista | Ver Oferta",
  "subheadline": "frase de apoio com máximo 60 caracteres",
  "layout": "um de: product_hero | text_focus | offer_highlight | testimonial_style",
  "color_scheme": "um de: brand_orange | dark_premium | clean_white | bold_contrast",
  "visual_elements": ["lista de elementos visuais sugeridos como strings"],
  "compliance_notes": "observações sobre compliance Meta se houver"
}

Não inclua explicações fora do JSON.`;
}

export function buildRegeneratePrompt(context: CreativeContext, feedback: string): string {
  return `${buildCreativePrompt(context)}

FEEDBACK DO USUÁRIO SOBRE O CRIATIVO ANTERIOR:
${feedback}

Leve o feedback em consideração e gere um novo criativo melhorado.`;
}
