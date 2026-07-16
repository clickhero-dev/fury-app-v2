import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, PlannerOutput, CopywriterOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function copywriterAgent(ctx: AgentContext, planner: PlannerOutput): Promise<CopywriterOutput> {
  const postsDesc = planner.posts.map(p => `Dia ${p.dayIndex} — ${p.postType} — "${p.title}" (${p.category})`).join('\n');
  const prompt = `Escreva legendas para:
Empresa: ${ctx.tenant.name}
Tom: ${ctx.brandKit?.voiceTone ?? 'profissional'}
Posts:\n${postsDesc}

Regras: 100-300 chars. CTA claro. 5-10 hashtags.

JSON: {"posts":[{"dayIndex":1,"caption":"Legenda...","cta":"Saiba mais","hashtags":["#tag1","#tag2"]}]}`;

  let lastError: unknown;
  // ponytail: 2 retries p/ parse failure e rate limit
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await openrouterService.chat(
        [{ role: 'system', content: 'Copywriter senior. JSON.' }, { role: 'user', content: prompt }],
        { model: 'deepseek/deepseek-v4-flash', temperature: 0.8, max_tokens: 4000, response_format: { type: 'json_object' } },
      );
      return parseAgentJSON<CopywriterOutput>(raw);
    } catch (err) {
      lastError = err;
      console.warn(`[copywriterAgent] attempt ${attempt} failed:`, (err as Error).message);
    }
  }
  throw lastError;
}
