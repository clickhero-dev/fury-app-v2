import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, ResearchOutput, StrategyOutput, PlannerOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

const MAX_POSTS = 30;

export async function plannerAgent(ctx: AgentContext, research: ResearchOutput, strategy: StrategyOutput, postCount = 16): Promise<PlannerOutput> {
  const count = Math.min(Math.max(Math.trunc(postCount), 1), MAX_POSTS);
  const pillars = strategy.contentPillars.map(p => `${p.name} (${p.ratio}%)`).join(', ');
  const prompt = `Crie calendario de ${count} posts para:
Empresa: ${ctx.tenant.name}
Objetivo: ${strategy.objective}
Pilares: ${pillars}
Datas: ${research.holidays.map(h => `${h.name} (dia ${h.day})`).join(', ')}

Regras: Max 30% sales. Alternar formatos. dayIndex 1-31.

JSON: {"totalPosts":${count},"summary":{"reelsCount":0,"carouselCount":0,"imageCount":0,"storiesCount":0},"posts":[{"dayIndex":1,"postType":"reel","platform":"instagram","title":"Titulo","contentPillar":"Produto","category":"engagement"}]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Planejador editorial. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.8, max_tokens: 3000, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<PlannerOutput>(raw);
}
