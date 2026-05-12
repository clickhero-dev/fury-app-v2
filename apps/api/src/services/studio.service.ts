import { claude } from '../lib/claude';
import { creative_assets } from '../../../../packages/db/src/schema'
import { db } from '../../../../packages/db/src'
import { eq } from 'drizzle-orm';

const CHAR_LIMITS = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: 300, // Soft limit for prompt
};

type CopyType = keyof typeof CHAR_LIMITS;

function calcularPontuacao(texto: string, type: CopyType): number {
  let pontuacao = 3.0; // Base score

  // 1. Check character limits
  if (texto.length <= CHAR_LIMITS[type]) {
    pontuacao += 3.0;
  }

  // 2. Check for clear call to action
  const ctaKeywords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  if (ctaKeywords.some((keyword) => texto.toLowerCase().includes(keyword))) {
    pontuacao += 2.0;
  }

  // 3. Check for forbidden words
  const forbiddenKeywords = ['grátis', 'garantido 100%', 'melhor do mundo'];
  if (
    !forbiddenKeywords.some((keyword) => texto.toLowerCase().includes(keyword))
  ) {
    pontuacao += 2.0;
  }

  return Math.min(pontuacao, 10.0); // Cap at 10
}

async function generateCopy({
  tenantId,
  type,
  produto,
  publico,
  objetivo,
  tom,
  quantidadeVariacoes,
}: {
  tenantId: string;
  type: CopyType;
  produto: string;
  publico: string;
  objetivo: string;
  tom: 'formal' | 'casual' | 'urgente' | 'emocional';
  quantidadeVariacoes: number;
}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      'ANTHROPIC_API_KEY is not set. Using fallback response.'
    );
    return {
      variacoes: [
        {
          texto: `${produto} — transforme seu negócio hoje!`,
          caracteres: `${produto} — transforme seu negócio hoje!`.length,
          pontuacao: 7.0,
        },
        {
          texto: `Descubra ${produto} para ${publico}`,
          caracteres: `Descubra ${produto} para ${publico}`.length,
          pontuacao: 6.5,
        },
        {
          texto: `A melhor escolha em ${produto}`,
          caracteres: `A melhor escolha em ${produto}`.length,
          pontuacao: 6.0,
        },
      ],
    };
  }

  const systemPrompt = `Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram.
Gere variações de copy persuasivas, claras e em português brasileiro adequadas para o público-alvo.
Respeite RIGOROSAMENTE os limites de caracteres especificados.
Responda APENAS em JSON válido, sem texto adicional, sem markdown.`;

  const userPrompt = `Produto/serviço: ${produto}
Público-alvo: ${publico}
Objetivo do anúncio: ${objetivo}
Tom de comunicação: ${tom}

Gere ${quantidadeVariacoes} variações de ${type} em português brasileiro.
Limite máximo: ${CHAR_LIMITS[type]} caracteres por variação.

Retorne APENAS este JSON:
{
  "variacoes": [
    { "texto": "texto da variação aqui", "caracteres": 0 }
  ]
}`;

  const response = await claude.messages.create({
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content[0].type === 'text'
    ? response.content[0].text
    : '';
  const parsed = JSON.parse(responseText.replace(/```json|```/g, '').trim());

  const finalVariations = parsed.variacoes.map((v: { texto: string }) => ({
    texto: v.texto,
    caracteres: v.texto.length,
    pontuacao: calcularPontuacao(v.texto, type),
  }));

  // Save to database (fire and forget)
  db.insert(creative_assets)
    .values({
      tenantId,
      type: 'copy',
      prompt: userPrompt,
      settings: {
        model: claude.model,
        type,
        tom,
        objetivo,
        publico,
        produto,
      },
      content: { variations: finalVariations }, // Store the full JSON with scores
      complianceStatus: 'approved', // Copy doesn't need image compliance
      url: null,
    })
    .then(() => console.log('Creative asset saved for tenant:', tenantId))
    .catch((err) =>
      console.error('Failed to save creative asset:', err.message),
    );

  return { variacoes: finalVariations };
}

async function generateImage(prompt: string) {
  // ...
}

export const studioService = {
  generateCopy,
  generateImage,
};