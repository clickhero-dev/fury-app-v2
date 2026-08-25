import { openrouterService } from '../services/llms/openrouter.service.js';
import type { AgentContext, ResearchOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function researchAgent(ctx: AgentContext): Promise<ResearchOutput> {
  const prompt = `Com base no perfil abaixo, liste: 1) 3 tendencias do nicho. 2) 3 datas comemorativas do mes ({"name":"Dia X","day":15}). 3) 3 topicos quentes.

Empresa: ${ctx.tenant.name}
Ramo: ${ctx.tenant.businessContext ?? '—'}
Produto: ${ctx.goals?.mainProduct ?? '—'}
Publico: ${JSON.stringify(ctx.goals?.targetAudience ?? {})}

Responda JSON: {"trends":["..."],"holidays":[{"name":"...","day":1}],"nicheTopics":["..."]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Analista de tendencias. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.7, max_tokens: 1000, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<ResearchOutput>(raw);
}
