import { openrouterService } from '../services/llms/openrouter.service.js';
import type { AgentContext, PlannerOutput, CopywriterOutput, CreativeOutput, BrandingOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

export async function brandingAgent(
  ctx: AgentContext,
  planner: PlannerOutput,
  copywriter: CopywriterOutput,
  creative: CreativeOutput,
): Promise<BrandingOutput> {
  const sample = planner.posts.slice(0, 5).map(p => {
    const c = copywriter.posts.find(x => x.dayIndex === p.dayIndex);
    const cr = creative.posts.find(x => x.dayIndex === p.dayIndex);
    return `Dia ${p.dayIndex} — ${p.postType}\n  Titulo: ${p.title}\n  CTA: ${c?.cta ?? ''}\n  Prompt: ${cr?.imagePrompt?.slice(0, 80) ?? ''}`;
  }).join('\n---\n');

  const prompt = `Analise branding e compliance.
Empresa: ${ctx.tenant.name}
Tom: ${ctx.brandKit?.voiceTone ?? 'profissional'}
Criterios: tom consistente, CTAs adequados, conteudo variado, adequado IG/FB, sem linguagem ofensiva

Posts:
${sample}

JSON: {"approved":true,"notes":"...","violations":["..."]}`;

  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Analista de branding. JSON. Seja criterioso mas justo.' }, { role: 'user', content: prompt }],
    { temperature: 0.3, max_tokens: 1000, response_format: { type: 'json_object' } },
  );
  return parseAgentJSON<BrandingOutput>(raw);
}
