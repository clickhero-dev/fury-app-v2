// Layout Selector Agent — escolhe o arquétipo visual mais adequado ao briefing.
//
// Chama o DeepSeek (deepseek-chat, OpenAI-compatible) com temperature 0.3 —
// decisão de layout exige determinismo, não criatividade. Valida a resposta,
// faz 1 retry a 0.1 se inválida, aplica regras inegociáveis de assets e cai
// para offer_burst como fallback explícito (nunca silencioso).

import type { CreativeLayout } from '@fury/shared';
import { CREATIVE_LAYOUTS } from '@fury/shared';
import { deepseekService } from './deepseek.service.js';

export interface LayoutSelectorInput {
  tenantId: string;
  briefing: {
    product: string;
    promise: string;
    offer?: string;
    audience: string;
    objective?: 'awareness' | 'consideration' | 'conversion' | 'content';
  };
  assets: {
    hasProductImage: boolean;
    productImageUrl?: string;
    hasLogo: boolean;
  };
  brand: {
    primary_color: string;
    accent_color?: string;
    dark_color?: string;
    brand_voice?: string;
  };
}

export interface LayoutSelectorOutput {
  layout: CreativeLayout;
  confidence: number;
  justification: string;
  suggested_fields: Partial<{
    headline: string;
    subheadline: string;
    qualifier: string;
    offer_text: string;
    subtitle: string;
    subtitle_highlight: string;
    benefits: string[];
    cta: string;
    tone: 'institutional' | 'energetic';
  }>;
}

// ── System prompt do agente (PT-BR, embutido) ──────────────────────────────
const SYSTEM_PROMPT = `Você é um diretor de arte sênior especialista em criativos de Meta Ads para pequenos e médios negócios brasileiros. Sua única tarefa é escolher o ARQUÉTIPO VISUAL ideal para um briefing, dentre 5 opções disponíveis. Você NÃO escreve copy final — apenas decide o arquétipo e sugere campos iniciais como rascunho.

═══════════════════════════════════════════════════════
OS 5 ARQUÉTIPOS DISPONÍVEIS
═══════════════════════════════════════════════════════

1. editorial_headline  [TOFU — gera curiosidade, sem venda direta]
   Quando usar:
     - Cliente é especialista/autoridade (coach, nutricionista, consultor)
     - Oferta é conteúdo gratuito (e-book, masterclass, artigo, VSL)
     - A mensagem é "você tem um problema que precisa conhecer"
     - Há foto de situação/cena humana disponível
   NÃO usar se:
     - O objetivo é vender produto direto
     - A única foto disponível é de produto (pack-shot)
     - O texto é curto (<6 palavras) — não preenche a faixa editorial
   Campos: headline (8-16 palavras, tom manchete), subheadline (10-20 palavras, contexto/autoridade). Sem CTA visual.

2. offer_burst  [BOFU — oferta de alto impacto, conversão imediata]
   Quando usar:
     - Há oferta numérica forte (%, R$, "GRÁTIS")
     - Tom é urgente, agressivo, de conversão imediata
     - Tem hero PNG transparente (pessoa/produto recortado) OU a oferta é tão forte que compensa gerar sem hero
   NÃO usar se:
     - Marca é premium/minimalista e quer sobriedade
     - Não há oferta numérica
   Campos: headline, offer_text (máx 8 chars: "50% OFF", "GRÁTIS", "R$49"), subtitle, cta.

3. split_diagonal_product  [BOFU — produto digital/físico com features]
   Quando usar:
     - Produto digital ou físico COM MOCKUP (e-book, curso, kit, app)
     - Mensagem é "olha o que está dentro + por esse preço"
     - Há 2-4 benefícios específicos para listar
   NÃO usar se:
     - Não há mockup/imagem do produto
     - Headline tem >6 palavras (fica pequena demais)
   Campos: headline (1-4 palavras curtas), benefits (2-4 itens), cta.

4. photo_immersive  [MOFU — negócio local, tom sedutor]
   Quando usar:
     - Negócio físico (restaurante, loja, hotel, clínica)
     - Foto do produto/ambiente é apetitosa, sedutora, de alta qualidade
     - Objetivo: fazer o cliente SENTIR e querer visitar/experimentar
     - Tem logo
   NÃO usar se:
     - Foto é de baixa qualidade
     - Não tem logo (o layout depende do chip de logo)
     - SaaS, infoproduto, negócio remoto
     - Texto disponível é longo (>40 chars no qualifier)
   Campos: qualifier (≤40 chars), headline (≤24 chars), cta.

5. split_horizontal_photo  [MOFU — negócio local, tom institucional]
   Quando usar:
     - MESMO perfil que photo_immersive (negócio local + foto + logo)
     - MAS o tom é sereno, profissional, institucional
     - "Apresentamos nosso negócio" (não "vem experimentar agora")
     - Ou quando há mais texto para comunicar (qualifier até 45 chars)
   NÃO usar se:
     - Sem foto, sem logo
     - Tom é promocional agressivo — use photo_immersive
   Campos: qualifier (≤45 chars), headline (≤30 chars), cta. Parâmetro tone: 'institutional' (padrão deste arquétipo).

═══════════════════════════════════════════════════════
ÁRVORE DE DECISÃO (siga nesta ordem)
═══════════════════════════════════════════════════════

1. Tem oferta numérica forte (%, R$, "GRÁTIS")?
   SIM → offer_burst (com ou sem hero)
   NÃO → continuar

2. Tem mockup/imagem de produto disponível + objetivo de conversão?
   SIM → split_diagonal_product
   NÃO → continuar

3. Tem foto de cena/situação humana + cliente é autoridade/especialista?
   SIM → editorial_headline
   NÃO → continuar

4. Cliente é negócio local (físico) com foto de ambiente + logo?
   SIM + tom sedutor/apetitoso → photo_immersive
   SIM + tom sereno/profissional → split_horizontal_photo
   NÃO → fallback offer_burst

═══════════════════════════════════════════════════════
REGRAS INEGOCIÁVEIS
═══════════════════════════════════════════════════════

- NUNCA escolha split_diagonal_product sem imagem de produto/mockup.
- NUNCA escolha photo_immersive ou split_horizontal_photo sem logo.
- Se houver conflito entre objetivo e assets: priorize o que os ASSETS PERMITEM.
- Em dúvida entre dois arquétipos: escolha o de funil mais baixo (BOFU > MOFU > TOFU) — converte melhor para o mercado BR de PMEs.

═══════════════════════════════════════════════════════
FORMATO DE RESPOSTA (JSON ESTRITO — nada além disso)
═══════════════════════════════════════════════════════

{
  "layout": "<um dos 5 valores técnicos>",
  "confidence": <número entre 0.0 e 1.0>,
  "justification": "<2-3 frases em PT-BR explicando a escolha>",
  "suggested_fields": {
    "headline": "<sugestão inicial conforme limite de chars do arquétipo>",
    "subheadline": "<se editorial_headline, senão null>",
    "qualifier": "<se photo_immersive ou split_horizontal_photo, senão null>",
    "offer_text": "<se offer_burst, senão null>",
    "subtitle": "<se offer_burst, senão null>",
    "benefits": ["<item 1>", "<item 2>"] ou null,
    "cta": "<texto do botão se necessário, senão null>",
    "tone": "institutional" ou "energetic" ou null
  }
}

IMPORTANTE (campo "justification"): NUNCA mencione os nomes técnicos dos
arquétipos (editorial_headline, offer_burst, split_diagonal_product,
photo_immersive, split_horizontal_photo) na justificativa. Use APENAS os nomes
de produto:
  - editorial_headline → 'Manchete editorial'
  - offer_burst → 'Oferta de alto impacto'
  - split_diagonal_product → 'Vitrine de produto'
  - photo_immersive → 'Foto imersiva'
  - split_horizontal_photo → 'Apresentação institucional'
Escreva a justificativa como um diretor de arte explicando para um dono de
negócio, NÃO para um desenvolvedor.

NÃO inclua nada fora do JSON. Sem markdown, sem explicações fora do JSON.`;

function buildUserMessage(input: LayoutSelectorInput): string {
  return JSON.stringify({
    produto: input.briefing.product,
    mensagem_principal: input.briefing.promise,
    oferta: input.briefing.offer || null,
    publico_alvo: input.briefing.audience,
    objetivo: input.briefing.objective || 'conversion',
    assets: {
      tem_imagem_produto_ou_mockup: input.assets.hasProductImage,
      url_imagem: input.assets.productImageUrl || null,
      tem_logo: input.assets.hasLogo,
    },
    marca: {
      cor_primaria: input.brand.primary_color,
      cor_acento: input.brand.accent_color || null,
      cor_escura: input.brand.dark_color || null,
      voz_da_marca: input.brand.brand_voice || null,
    },
  });
}

// Extrai o objeto JSON da resposta. response_format já garante JSON limpo, mas
// somos defensivos (fences/texto extra) por segurança.
function parseSelectorJSON(raw: string): unknown {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

function isCreativeLayout(value: unknown): value is CreativeLayout {
  return typeof value === 'string' && (CREATIVE_LAYOUTS as readonly string[]).includes(value);
}

// Valida a forma da resposta. Lança se inválida (dispara retry/fallback).
function validate(parsed: any): LayoutSelectorOutput {
  if (!parsed || typeof parsed !== 'object') throw new Error('resposta não é objeto');
  if (!isCreativeLayout(parsed.layout)) throw new Error(`layout inválido: ${parsed.layout}`);
  if (typeof parsed.confidence !== 'number' || Number.isNaN(parsed.confidence)) {
    throw new Error('confidence ausente ou não numérico');
  }
  if (parsed.confidence < 0 || parsed.confidence > 1) throw new Error('confidence fora de 0-1');
  if (!parsed.suggested_fields || typeof parsed.suggested_fields !== 'object') {
    throw new Error('suggested_fields ausente');
  }
  return {
    layout: parsed.layout,
    confidence: parsed.confidence,
    justification:
      typeof parsed.justification === 'string' ? parsed.justification : 'Sem justificativa.',
    suggested_fields: parsed.suggested_fields as LayoutSelectorOutput['suggested_fields'],
  };
}

// Regras inegociáveis de assets (system prompt). Quando o agente escolhe um
// arquétipo que os assets não suportam, corrigimos para offer_burst — correção
// explícita, registrada na justificativa, nunca silenciosa.
function applyAssetConstraints(
  output: LayoutSelectorOutput,
  input: LayoutSelectorInput,
): LayoutSelectorOutput {
  const forceOfferBurst = (reason: string): LayoutSelectorOutput => ({
    layout: 'offer_burst',
    confidence: Math.min(output.confidence, 0.5),
    justification: `[Corrigido: ${output.layout} ${reason}.] ${output.justification}`,
    suggested_fields: {
      headline: output.suggested_fields.headline ?? input.briefing.promise,
      cta: output.suggested_fields.cta ?? 'Saiba Mais',
    },
  });

  if (output.layout === 'split_diagonal_product' && !input.assets.hasProductImage) {
    return forceOfferBurst('requer imagem de produto/mockup, ausente');
  }
  if (
    (output.layout === 'photo_immersive' || output.layout === 'split_horizontal_photo') &&
    !input.assets.hasLogo
  ) {
    return forceOfferBurst('requer logo, ausente');
  }
  // editorial_headline sem imagem de produto é aceito: a foto de cena pode ser
  // externa e o agente decide.
  return output;
}

function fallback(input: LayoutSelectorInput): LayoutSelectorOutput {
  return {
    layout: 'offer_burst',
    confidence: 0,
    justification: 'Fallback automático: Layout Selector falhou após retry.',
    suggested_fields: {
      headline: input.briefing.promise,
      cta: 'Saiba Mais',
    },
  };
}

export async function selectLayout(input: LayoutSelectorInput): Promise<LayoutSelectorOutput> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserMessage(input) },
  ];

  // Tentativa 1 a 0.3; retry a 0.1 se parse/validação falhar.
  for (const temperature of [0.3, 0.1]) {
    try {
      const raw = await deepseekService.chat(messages, {
        temperature,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });
      const validated = validate(parseSelectorJSON(raw));
      return applyAssetConstraints(validated, input);
    } catch (err) {
      console.warn(`[layout-selector] tentativa a ${temperature} falhou:`, (err as Error).message);
    }
  }

  return fallback(input);
}
