import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, ResearchOutput, AnalyticsOutput, StrategyOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function strategyAgent(ctx: AgentContext, research: ResearchOutput, analytics: AnalyticsOutput): Promise<StrategyOutput> {
  const prompt = `Crie estrategia mensal para:
Empresa: ${ctx.tenant.name}
Ramo: ${ctx.tenant.businessContext ?? '—'}
Objetivo: ${ctx.goals?.objective ?? 'Engajamento'}
Produto: ${ctx.goals?.mainProduct ?? '—'}
Tom: ${ctx.brandKit?.voiceTone ?? 'profissional'}
Tendencias: ${research.trends.join(', ')}
Datas: ${research.holidays.map(h => `${h.name} (dia ${h.day})`).join(', ')}

JSON: {"objective":"...","contentPillars":[{"name":"Produto","ratio":40},{"name":"Engajamento","ratio":30},{"name":"Educacional","ratio":30}],"toneGuidelines":"...","targetAudience":"..."}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Estrategista senior. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.8, max_tokens: 1200, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<StrategyOutput>(raw);
}
