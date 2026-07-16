import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, ResearchOutput, StrategyOutput, PlannerOutput } from './types.js';

export async function plannerAgent(ctx: AgentContext, research: ResearchOutput, strategy: StrategyOutput): Promise<PlannerOutput> {
  const pillars = strategy.contentPillars.map(p => `${p.name} (${p.ratio}%)`).join(', ');
  const prompt = `Crie calendario de 16 posts para:
Empresa: ${ctx.tenant.name}
Objetivo: ${strategy.objective}
Pilares: ${pillars}
Datas: ${research.holidays.map(h => `${h.name} (dia ${h.day})`).join(', ')}

Regras: Max 30% sales. Alternar formatos. dayIndex 1-31.

JSON: {"totalPosts":16,"summary":{"reelsCount":8,"carouselCount":4,"imageCount":4,"storiesCount":31},"posts":[{"dayIndex":1,"postType":"reel","platform":"instagram","title":"Titulo","contentPillar":"Produto","category":"engagement"}]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Planejador editorial. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.8, max_tokens: 3000, response_format: { type: 'json_object' } },
  );
  return JSON.parse(raw) as PlannerOutput;
}
