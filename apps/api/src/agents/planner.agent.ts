import { z } from 'zod';
import { createBasicAgent } from './base.agent.js';
import { parseAgentJSON } from './utils.js';
import type { PlannerContext, ImportantDate, PlannerPrompt, PlannerPromptsOutput } from './types.js';

// ─── Schemas zod de saída estruturada do langchain (responseFormat) ──────────
const importantDateSchema = z.object({
  date: z.string().describe('Data no formato YYYY-MM-DD'),
  name: z.string().describe('Nome da data comemorativa/relevante'),
  reason: z.string().optional().describe('Por que é relevante para cidade/nicho'),
});
const datesSchema = z.object({ dates: z.array(importantDateSchema) });

const promptSchema = z.object({
  date: z.string().describe('Data do post no formato YYYY-MM-DD'),
  title: z.string().describe('Título curto do post'),
  caption: z.string().describe('Legenda completa em português'),
  cta: z.string().describe('Chamada para ação'),
  hashtags: z.array(z.string()).describe('Lista de hashtags'),
  imagePrompt: z.string().describe('Prompt detalhado para gerar a imagem do post'),
  postType: z.enum(['image', 'carousel', 'reel', 'stories']),
  platform: z.enum(['instagram', 'facebook', 'both']),
});
const postsSchema = z.object({ posts: z.array(promptSchema) });

// ─── System prompts ──────────────────────────────────────────────────────────
const RESEARCH_SYSTEM_PROMPT = `Você é um especialista em datas comemorativas e datas relevantes do Brasil.
Dado o nicho e a cidade de uma empresa, liste datas importantes e relevantes para criar conteúdo de redes sociais.
Inclua feriados nacionais, datas comemorativas, datas sazonais do nicho e datas locais da cidade quando fizer sentido.
Responda APENAS em JSON válido no formato: {"dates":[{"date":"YYYY-MM-DD","name":"...","reason":"..."}]}.
Gere pelo menos 8 datas, todas dentro dos próximos 60 dias, em ordem cronológica.`;

const PROMPTS_SYSTEM_PROMPT = `Você é o planejador de conteúdo de redes sociais de um negócio local.
Receba o contexto da empresa (nome, tom, cor, produtos, nicho, cidade) e uma lista de datas relevantes.
Crie EXATAMENTE 8 posts estruturados, distribuídos nas próximas semanas, priorizando as datas relevantes fornecidas.
Se houver menos de 8 datas relevantes, complete com conteúdo evergreen do nicho.
Cada post deve ter um prompt de imagem detalhado (cena, composição, cores da marca, estilo), legenda em português, CTA e hashtags.
Responda APENAS em JSON válido no formato: {"posts":[{"date":"YYYY-MM-DD","title":"...","caption":"...","cta":"...","hashtags":["..."],"imagePrompt":"...","postType":"image|carousel|reel|stories","platform":"instagram|facebook|both"}]}
Retorne exatamente 8 posts.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function lastAssistantText<T extends { messages?: unknown[] }>(result: T): string {
  const messages = result.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { content?: unknown; role?: string; _getType?: () => string };
    if (m && typeof m.content === 'string') {
      const type = m._getType?.() ?? m.role;
      if (type === 'ai' || type === 'assistant' || type === 'human') return m.content;
    }
  }
  return '';
}

function brandDescription(ctx: PlannerContext): string {
  const tone = ctx.brandKit?.voiceTone || 'amigável';
  const color = ctx.brandKit?.primaryColor || 'não definida';
  const niche = ctx.goals?.niche || ctx.goals?.mainProduct || 'não definido';
  const city = ctx.city || 'nacional';
  return `Empresa: ${ctx.businessName}. Tom de voz: ${tone}. Cor principal: ${color}. ` +
    `Nicho/produto: ${niche}. Cidade: ${city}. Objetivo: ${ctx.goals?.objective || 'engajamento'}.`;
}

// ─── Agentes langchain ───────────────────────────────────────────────────────
/**
 * Etapa 2.2 do fluxo: levanta datas importantes/relevantes para a cidade e/ou
 * nicho da empresa usando o conhecimento do modelo (sem busca externa).
 */
export async function researchImportantDates(context: PlannerContext): Promise<ImportantDate[]> {
  const agent = createBasicAgent(RESEARCH_SYSTEM_PROMPT, 'deepseek/deepseek-chat-v4-flash', datesSchema);
  const result = await agent.invoke({ messages: [{ role: 'human', content: brandDescription(context) }] });

  const structured = (result as { structuredResponse?: { dates?: ImportantDate[] } }).structuredResponse;
  const parsed = structured ?? parseAgentJSON<{ dates: ImportantDate[] }>(lastAssistantText(result));
  return Array.isArray(parsed?.dates) ? parsed.dates.slice(0, 15) : [];
}

/**
 * Etapa 2.3 do fluxo: gera os 8 prompts de conteúdo estruturados (data, imagem,
 * legenda, CTA, hashtags) com base no contexto da empresa e nas datas.
 */
export async function generateContentPrompts(
  context: PlannerContext,
  dates: ImportantDate[],
): Promise<PlannerPrompt[]> {
  const agent = createBasicAgent(PROMPTS_SYSTEM_PROMPT, 'deepseek/deepseek-chat-v4-flash', postsSchema);
  const user = [
    brandDescription(context),
    '',
    'Datas relevantes disponíveis:',
    JSON.stringify(dates.map((d) => ({ date: d.date, name: d.name }))),
  ].join('\n');

  const result = await agent.invoke({ messages: [{ role: 'human', content: user }] });
  const structured = (result as { structuredResponse?: PlannerPromptsOutput }).structuredResponse;
  const parsed = structured ?? parseAgentJSON<PlannerPromptsOutput>(lastAssistantText(result));
  const posts = Array.isArray(parsed?.posts) ? parsed.posts : [];
  // Garante no máximo 8, sempre com data válida e melhor formato de imagem possível.
  return posts.slice(0, 8);
}