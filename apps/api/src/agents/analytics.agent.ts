import { openrouterService } from '../services/openrouter.service.js';
import type { AgentContext, AnalyticsOutput } from './types.js';

export async function analyticsAgent(ctx: AgentContext): Promise<AnalyticsOutput> {
  const prompt = `Com base na empresa, recomende: melhores formatos, dias da semana, 2 dicas de engajamento.
Empresa: ${ctx.tenant.name}
Ramo: ${ctx.tenant.businessContext ?? '—'}
Tom: ${ctx.brandKit?.voiceTone ?? '—'}

JSON: {"bestFormats":["reel","carousel"],"bestDays":["terca","quinta"],"engagementTips":["dica1","dica2"]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Analista de metricas. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.7, max_tokens: 800, response_format: { type: 'json_object' } },
  );
  return JSON.parse(raw) as AnalyticsOutput;
}
