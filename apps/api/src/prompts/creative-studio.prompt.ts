import type { CreativeLayout } from '@fury/shared';

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
  // Arquétipo já resolvido pelo Layout Selector Agent (ou override do body).
  // TEMPLATE_MAP/templateStyle foram removidos em 15/06/2026 — o layout não é
  // mais escolhido por um mapa de templateStyle.
  layout: CreativeLayout;
}

// Instruções de copy específicas para cada arquétipo. O DeepSeek gera apenas
// os campos pedidos para o layout recebido.
const LAYOUT_COPY_INSTRUCTIONS: Record<CreativeLayout, string> = {
  editorial_headline: `Gere headline estilo manchete de curiosidade (8-16 palavras, tom jornalístico).
Gere subheadline de autoridade (10-20 palavras).
NÃO gere cta.`,
  offer_burst: `Gere headline categórica e curta.
Gere offer_text com a oferta numérica (máx 8 caracteres: "50% OFF", "GRÁTIS", "R$49").
Gere subtitle com a quebra de objeção e subtitle_highlight com a palavra-chave de ênfase (substring do subtitle).
Gere cta curto.`,
  split_diagonal_product: `Gere headline curta (1-4 palavras).
Gere benefits: array com 3 itens, cada um com no máximo 60 caracteres.
Gere cta (máx 12 caracteres).`,
  photo_immersive: `Gere qualifier (oferta/qualificador, máx 40 caracteres, em CAIXA ALTA).
Gere headline (identidade do negócio, máx 24 caracteres, em CAIXA ALTA).
Gere cta (máx 18 caracteres).`,
  split_horizontal_photo: `Gere qualifier (máx 45 caracteres).
Gere headline (máx 30 caracteres).
Gere cta (máx 18 caracteres).`,
};

export function buildCreativePrompt(context: CreativeContext): string {
  const layoutInstructions = LAYOUT_COPY_INSTRUCTIONS[context.layout];

  return `Você é um especialista em criativos de alta performance para Meta Ads no mercado brasileiro.

Com base no contexto abaixo, gere a copy de um criativo de anúncio para o arquétipo visual "${context.layout}".

NEGÓCIO: ${context.businessName}
OBJETIVO: ${context.objective}
O QUE SERÁ ANUNCIADO: ${context.product}
PROMESSA: ${context.promise}
${context.offer ? `OFERTA: ${context.offer}` : ''}
PÚBLICO: ${context.audience}
TOM DE VOZ: ${context.tone || 'profissional e direto'}
${context.hasProductImage ? 'O usuário forneceu imagem do produto — a copy deve complementá-la.' : ''}

ARQUÉTIPO: ${context.layout}
INSTRUÇÕES DE COPY PARA ESTE ARQUÉTIPO:
${layoutInstructions}

Verifique a ortografia — erros como "internacionales" ou "Inscriçcões" são inaceitáveis. Revise cada palavra antes de responder.

Responda SOMENTE em JSON válido. Inclua apenas os campos pedidos para o arquétipo
e ecoe "layout" exatamente como "${context.layout}":
{
  "headline": "texto da manchete",
  "subheadline": "(apenas se pedido para o arquétipo)",
  "qualifier": "(apenas se pedido para o arquétipo)",
  "offer_text": "(apenas se pedido para o arquétipo)",
  "subtitle": "(apenas se pedido para o arquétipo)",
  "subtitle_highlight": "(apenas se pedido para o arquétipo)",
  "benefits": ["(apenas se pedido para o arquétipo)"],
  "cta": "(apenas se pedido para o arquétipo)",
  "layout": "${context.layout}"
}

NÃO inclua color_scheme. NÃO inclua explicações fora do JSON.`;
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

export function buildRegeneratePrompt(context: CreativeContext, feedback: string, originalCopy?: Record<string, string | string[] | undefined>): string {
  const originalBlock = originalCopy
    ? `\nCRIATIVO ORIGINAL (preserve estes valores — altere APENAS o que o feedback pede):
${JSON.stringify(originalCopy, null, 2)}
`
    : '';

  return `${buildCreativePrompt(context)}
${originalBlock}
FEEDBACK DO USUÁRIO SOBRE O CRIATIVO ANTERIOR:
${feedback}

PRESERVE RIGOROSAMENTE todos os campos do criativo original que não forem
mencionados no feedback. Altere APENAS o que o feedback pede explicitamente.
Não reescreva a copy inteira — o objetivo é aplicar UM ajuste localizado.

Leve o feedback em consideração e gere um criativo atualizado.`;}
