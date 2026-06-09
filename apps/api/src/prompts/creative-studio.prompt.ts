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
  templateStyle?: string;
}

const TEMPLATE_MAP: Record<string, { layout: string; color_scheme: string }> = {
  'product-focus':      { layout: 'product_hero',       color_scheme: 'brand_orange' },
  'irresistible-offer': { layout: 'offer_highlight',    color_scheme: 'bold_contrast' },
  'transformation':     { layout: 'text_focus',         color_scheme: 'clean_white' },
  'social-proof':       { layout: 'testimonial_style',  color_scheme: 'clean_white' },
  'minimal-premium':    { layout: 'text_focus',         color_scheme: 'dark_premium' },
  'bold-direct':        { layout: 'text_focus',         color_scheme: 'bold_contrast' },
  'educational':        { layout: 'text_focus',         color_scheme: 'clean_white' },
  'institutional':      { layout: 'product_hero',       color_scheme: 'clean_white' },
};

export function buildCreativePrompt(context: CreativeContext): string {
  const forced = context.templateStyle ? TEMPLATE_MAP[context.templateStyle] : null;
  const layoutInstruction = forced
    ? `Use EXATAMENTE: "layout": "${forced.layout}", "color_scheme": "${forced.color_scheme}"`
    : `"layout": "um de: product_hero | text_focus | offer_highlight | testimonial_style",\n  "color_scheme": "um de: brand_orange | dark_premium | clean_white | bold_contrast"`;

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
${forced ? `ESTILO VISUAL OBRIGATÓRIO: layout="${forced.layout}", color_scheme="${forced.color_scheme}" — não altere esses valores.` : ''}

Responda SOMENTE em JSON válido com esta estrutura exata:
{
  "headline": "texto impactante com máximo 40 caracteres",
  "primary_text": "texto principal do anúncio com máximo 125 caracteres, focado na promessa",
  "cta": "um de: Saiba Mais | Comprar Agora | Cadastre-se | Falar com Especialista | Ver Oferta",
  "subheadline": "frase de apoio com máximo 60 caracteres",
  ${layoutInstruction},
  "visual_elements": ["lista de elementos visuais sugeridos como strings"],
  "compliance_notes": "observações sobre compliance Meta se houver"
}

Não inclua explicações fora do JSON.`;
}

export interface ValidationContext {
  businessName: string;
  product: string;
  promise: string;
  offer?: string;
  audience: string;
}

export function buildValidationPrompt(ctx: ValidationContext): string {
  return `Você é um especialista em criação de anúncios para Meta Ads.

Analise o contexto abaixo e determine se há informações suficientes para criar um anúncio de alta performance.

CONTEXTO FORNECIDO:
- Negócio: ${ctx.businessName}
- O que será anunciado: ${ctx.product}
- Promessa/resultado: ${ctx.promise}
- Oferta/condição: ${ctx.offer || 'não informado'}
- Público-alvo: ${ctx.audience}

CRITÉRIOS DE AVALIAÇÃO:
1. Nome do produto ou serviço está claro?
2. Existe uma oferta concreta (preço, desconto, condição, prazo) ou benefício específico?
3. O público-alvo tem pelo menos uma característica identificável?
4. A promessa de resultado está clara?

Se TODOS os critérios estiverem atendidos, retorne:
{ "sufficient": true, "missing": [] }

Se algum critério estiver ausente, retorne:
{
  "sufficient": false,
  "missing": ["lista dos critérios ausentes"],
  "questions": [
    {
      "id": "identificador_unico",
      "question": "pergunta direta e simples em português informal",
      "placeholder": "exemplo de resposta esperada",
      "field": "campo que essa resposta vai preencher (product|offer|audience|promise)"
    }
  ]
}

IMPORTANTE:
- Máximo 2 perguntas por vez
- Linguagem simples e direta, sem jargões
- Perguntas específicas com base no que foi informado (não genéricas)
- Se o produto foi mencionado vagamente, pergunte pelo nome específico
- Nunca pergunte sobre nicho (já temos essa informação)

Responda SOMENTE em JSON válido.`;
}

export function buildRegeneratePrompt(context: CreativeContext, feedback: string): string {
  return `${buildCreativePrompt(context)}

FEEDBACK DO USUÁRIO SOBRE O CRIATIVO ANTERIOR:
${feedback}

Leve o feedback em consideração e gere um novo criativo melhorado.`;
}
