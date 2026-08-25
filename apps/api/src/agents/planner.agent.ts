import { openrouterService } from '../services/llms/openrouter.service.js';
import type { AgentContext, ResearchOutput, StrategyOutput, PlannerOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function plannerAgent(
  ctx: AgentContext,
  research: ResearchOutput,
  strategy: StrategyOutput,
  currentDate: string
): Promise<PlannerOutput> {
  const pillars = strategy.contentPillars.map(p => `${p.name} (${p.ratio}%)`).join(', ');

  // Calcula d+1 (amanhã) baseado na currentDate
  const current = new Date(currentDate);
  const tomorrow = new Date(current);
  tomorrow.setDate(current.getDate() + 1);
  const startDay = tomorrow.getDate();
  const startMonth = tomorrow.getMonth() + 1;
  const startYear = tomorrow.getFullYear();

  // Calcula último dia do mês do startDay
  const lastDayOfMonth = new Date(startYear, startMonth, 0).getDate();

  const pillarsStr = strategy.contentPillars.map(p => `${p.name} (${p.ratio}%)`).join(', ');

  const prompt = `Crie calendario de posts para:
Empresa: ${ctx.tenant.name}
Objetivo: ${strategy.objective}
Pilares: ${pillarsStr}
Datas comemorativas: ${research.holidays.map(h => `${h.name} (dia ${h.day})`).join(', ')}

REGRAS CRÍTICAS:
1. O planejamento deve começar NO DIA ${startDay}/${startMonth}/${startYear} (d+1 de hoje) - NÃO CRIE POSTS PARA DIAS PASSADOS
2. dayIndex deve ser entre ${startDay} e ${lastDayOfMonth} (dias restantes do mês)
3. Máximo 30% de posts sales. Alternar formatos (reel, carousel, image, stories).
4. Total de posts: 16. Resumo com contagens por tipo.

JSON: {"totalPosts":16,"summary":{"reelsCount":8,"carouselCount":4,"imageCount":4,"storiesCount":4},"posts":[{"dayIndex":${startDay},"postType":"reel","platform":"instagram","title":"Titulo","contentPillar":"Produto","category":"engagement"}]}`;

  const raw = await openrouterService.chat(
    [
      { role: 'system', content: 'Planejador editorial. JSON válido apenas.' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.8, max_tokens: 3000, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<PlannerOutput>(raw);
}
