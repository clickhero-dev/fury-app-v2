import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, PlannerOutput, CreativeOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function creativeAgent(ctx: AgentContext, planner: PlannerOutput): Promise<CreativeOutput> {
  const postsDesc = planner.posts.map(p => `Dia ${p.dayIndex} — ${p.postType} — "${p.title}"`).join('\n');
  const prompt = `Crie prompts de imagem IA estilo FLUX para:
Empresa: ${ctx.tenant.name}
Posts:\n${postsDesc}

Regras: Descrever cena, estilo, cores. 30-80 palavras.

JSON: {"posts":[{"dayIndex":1,"imagePrompt":"Cena detalhada..."}]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Diretor de arte. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.9, max_tokens: 3000, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<CreativeOutput>(raw);
}
