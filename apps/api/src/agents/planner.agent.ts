import { z } from 'zod';
import { createBasicAgent } from './base.agent.js';
import { parseAgentJSON } from './utils.js';
import type { PlannerContext, PlannerPrompt, PlannerContentItem } from './types.js';

// ─── Schema zod de saída (shape achatado: só conteúdo, sem datas/enums) ───────
// A IA NÃO decide datas, postType, platform, cta ou hashtags — esses campos são
// derivados no código (buildContentDates/deriveCta/deriveHashtags) para evitar
// estruturação frágil de resposta e erro de parse entre fases.
const contentItemSchema = z.object({
  title: z.string().describe('Título curto do post'),
  descricao: z.string().describe('Legenda completa em português'),
  prompt: z.string().describe('Prompt detalhado para gerar a imagem do post'),
});
const contentSchema = z.object({ posts: z.array(contentItemSchema) });

const PROMPTS_SYSTEM_PROMPT = (count: number) =>
  `Você é o planejador de conteúdo de redes sociais de um negócio local.
Receba o contexto da empresa (nome, tom, cor, produtos, nicho, cidade) e uma lista de datas já definidas.
Para CADA data fornecida, crie UM item de conteúdo com:
- title: título curto e chamativo do post
- descricao: legenda completa em português brasileiro, engajadora e com o tom da marca
- prompt: descrição detalhada da imagem (cena, composição, cores da marca, estilo)
REGRA CRÍTICA DA IMAGEM: a imagem DEVE retratar fielmente o produto/serviço real informado no contexto (ex.: se o nicho é padaria, mostre pães, vitrine, padaria). NUNCA misture o produto com conceitos de tecnologia/software/app/digital (ex.: NÃO gere "pão digital", app de padaria, ícones de programação). A imagem deve ser fotográfica e apetitosa, SEM texto, SEM letras na imagem e SEM logotipos de outras empresas.
Responda APENAS em JSON válido no formato: {"posts":[{"title":"...","descricao":"...","prompt":"..."}]}
Retorne exatamente ${count} itens, um para cada data, na mesma ordem das datas fornecidas.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function brandDescription(ctx: PlannerContext): string {
  const tone = ctx.brandKit?.voiceTone || 'amigável';
  const color = ctx.brandKit?.primaryColor || 'não definida';
  const niche = ctx.goals?.niche || ctx.goals?.mainProduct || 'não definido';
  const city = ctx.city || 'nacional';
  return `Empresa: ${ctx.businessName}. Tom de voz: ${tone}. Cor principal: ${color}. ` +
    `Nicho/produto: ${niche}. Cidade: ${city}. Objetivo: ${ctx.goals?.objective || 'engajamento'}.`;
}

/** Extrai texto de uma mensagem da IA, lidando com content string OU array de blocos. */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object') {
        const b = block as { type?: string; text?: unknown };
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0) return b.text;
      }
    }
  }
  return '';
}

function lastAssistantText<T extends { messages?: unknown[] }>(result: T): string {
  const messages = result.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { content?: unknown; role?: string; _getType?: () => string };
    if (!m) continue;
    const type = m._getType?.() ?? m.role;
    if (type !== 'ai' && type !== 'assistant' && type !== 'human') continue;
    const text = extractTextFromContent(m.content);
    if (text.trim().length > 0) return text;
  }
  return '';
}

// ─── Datas (espaçamento puro, determinístico — sem LLM) ───────────────────────
export interface ContentDate {
  date: string; // ISO 'YYYY-MM-DD'
  name: string;
}

/**
 * Gera N datas futuras a partir de `from` (default: hoje), espaçadas de forma
 * variada (2/3 dias) para não cair sempre no mesmo dia da semana, pulando domingos.
 * 100% determinístico — a decisão de datas NUNCA é delegada à IA.
 */
export function buildContentDates(count = 8, from = new Date()): ContentDate[] {
  const dates: ContentDate[] = [];
  const cursor = new Date(from);
  // Começa amanhã (UTC) para nunca cair no dia corrente.
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  cursor.setUTCHours(0, 0, 0, 0);

  let step = 0;
  while (dates.length < count && step < count * 10) {
    if (cursor.getUTCDay() !== 0) {
      dates.push({ date: cursor.toISOString().split('T')[0], name: `Conteúdo #${dates.length + 1}` });
    }
    cursor.setUTCDate(cursor.getUTCDate() + (step % 2 === 0 ? 3 : 2));
    step++;
  }
  return dates;
}

// ─── CTA / hashtags (derivados no código, determinísticos) ────────────────────
const DEFAULT_CTAS = ['Saiba mais', 'Encomende agora', 'Garanta o seu', 'Aproveite a oportunidade', 'Fale conosco'];

/** Deriva o CTA a partir do objetivo do negócio (ou rotativo determinístico). */
export function deriveCta(ctx: PlannerContext, index = 0): string {
  const objective = (ctx.goals?.objective ?? '').toLowerCase();
  if (objective.includes('venda') || objective.includes('vender') || objective.includes('convers')) return 'Compre agora';
  if (objective.includes('cliente') || objective.includes('lead') || objective.includes('contato') || objective.includes('whats')) return 'Fale conosco';
  if (objective.includes('visita') || objective.includes('loja') || objective.includes('presen')) return 'Visite nossa loja';
  if (objective.includes('seguidor') || objective.includes('engajamento') || objective.includes('instagram')) return 'Siga e ative as notificações';
  const i = ((index % DEFAULT_CTAS.length) + DEFAULT_CTAS.length) % DEFAULT_CTAS.length;
  return DEFAULT_CTAS[i];
}

function slugifyTag(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Deriva hashtags de nicho/cidade/nome do negócio, normalizadas (sem espaço/acento). */
export function deriveHashtags(ctx: PlannerContext): string[] {
  const sources = [ctx.goals?.niche, ctx.city, ctx.businessName];
  const tags = sources
    .filter((s): s is string => Boolean(s && s.trim().length > 0))
    .map((s) => `#${slugifyTag(s)}`)
    .filter((t) => t.length > 1);
  return tags.length > 0 ? tags : ['#conteudo'];
}

// ─── Geração de conteúdo (uma chamada LLM, shape achatado) ────────────────────
function isValidContentItem(item: unknown): item is PlannerContentItem {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.title === 'string' && o.title.trim().length > 0 &&
    typeof o.descricao === 'string' && o.descricao.trim().length > 0 &&
    typeof o.prompt === 'string' && o.prompt.trim().length > 0
  );
}

/** Fallback determinístico (evergreen) — garante que o fluxo nunca trava por resposta vazia da IA. */
function fallbackContentItem(ctx: PlannerContext, index: number): PlannerContentItem {
  const product = ctx.goals?.mainProduct || ctx.goals?.niche || ctx.businessName || 'seu negócio';
  const city = ctx.city || 'sua cidade';
  const color = ctx.brandKit?.primaryColor || 'neutras';
  const tone = ctx.brandKit?.voiceTone || 'acolhedor';
  return {
    title: `Destaque de ${product}`,
    descricao: `Conheça ${product} na ${city}. Qualidade e atendimento que fazem a diferença no seu dia a dia. Venha conferir!`,
    prompt: `Imagem profissional de ${product} em ambiente real, cores da marca ${color}, iluminação natural, estilo ${tone} e convidativo.`,
  };
}

/**
 * Etapa de conteúdo do fluxo: recebe as datas já definidas pelo código e pede à IA
 * apenas o conteúdo de cada post ({title, descricao, prompt} — shape achatado).
 * O código faz o zip com data/postType/platform/cta/hashtags, filtra itens inválidos
 * e preenche gaps com fallback determinístico. Retorna SEMPRE dates.length posts.
 */
export async function generateContentPrompts(context: PlannerContext, dates: ContentDate[]): Promise<PlannerPrompt[]> {
  const count = dates.length;
  if (count === 0) return [];

  const agent = createBasicAgent(PROMPTS_SYSTEM_PROMPT(count), 'deepseek/deepseek-v4-flash', contentSchema);
  const user = [
    brandDescription(context),
    '',
    'Datas já definidas (uma por post, na ordem):',
    JSON.stringify(dates.map((d) => ({ date: d.date, name: d.name }))),
  ].join('\n');

  // timeout/maxRetries POR CHAMADA (RunnableConfig): sem isso, uma conexão
  // pendurada trava o job do planner por ~10min (default do SDK) — a tela
  // "gerando..." congela sem progresso até reiniciar a API.
  const result = await agent.invoke(
    { messages: [{ role: 'human', content: user }] },
    { timeout: 180_000, maxRetries: 2 } as any,
  );

  let items: PlannerContentItem[] = [];
  const structured = (result as { structuredResponse?: { posts?: unknown[] } }).structuredResponse;
  if (Array.isArray(structured?.posts)) {
    items = structured.posts.filter(isValidContentItem);
  } else {
    try {
      const parsed = parseAgentJSON<{ posts?: unknown[] }>(lastAssistantText(result));
      items = (Array.isArray(parsed?.posts) ? parsed.posts : []).filter(isValidContentItem);
    } catch {
      items = [];
    }
  }

  return dates.map((d, i) => {
    const content = items[i] ?? fallbackContentItem(context, i);
    return {
      date: d.date,
      title: content.title.trim(),
      caption: content.descricao.trim(),
      cta: deriveCta(context, i),
      hashtags: deriveHashtags(context),
      imagePrompt: content.prompt.trim(),
      postType: i % 2 === 0 ? 'image' : 'stories',
      platform: 'instagram',
    };
  });
}