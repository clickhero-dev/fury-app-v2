import type { PlannerOutput, CopywriterOutput, QualityOutput } from './types.js';

export async function qualityAgent(planner: PlannerOutput, copywriter: CopywriterOutput): Promise<QualityOutput> {
  const checks: QualityOutput['checks'] = [];
  let passed = true;

  const titles = planner.posts.map(p => p.title?.toLowerCase() ?? '');
  const dup = new Set(titles).size === titles.length;
  checks.push({ name: 'Conteudo duplicado', passed: dup, message: dup ? undefined : 'Titulos duplicados' });
  if (!dup) passed = false;

  const sales = planner.posts.filter(p => p.category === 'sales').length / planner.posts.length;
  const salesOk = sales <= 0.3;
  checks.push({ name: 'Distribuicao de vendas', passed: salesOk, message: salesOk ? undefined : `Vendas: ${Math.round(sales * 100)}% (max 30%)` });
  if (!salesOk) passed = false;

  let fmtOk = true;
  for (let i = 0; i < planner.posts.length - 2; i++) {
    if (planner.posts[i].postType === planner.posts[i+1].postType && planner.posts[i].postType === planner.posts[i+2].postType) {
      fmtOk = false; break;
    }
  }
  checks.push({ name: 'Alternar formatos', passed: fmtOk, message: fmtOk ? undefined : '3+ consecutivos mesmo formato' });
  if (!fmtOk) passed = false;

  const datesOk = planner.posts.every(p => p.dayIndex >= 1 && p.dayIndex <= 31);
  checks.push({ name: 'Datas validas', passed: datesOk, message: datesOk ? undefined : 'DayIndex fora 1-31' });
  if (!datesOk) passed = false;

  const allCta = copywriter.posts.every(p => p.cta?.trim().length > 0);
  checks.push({ name: 'CTA presente', passed: allCta, message: allCta ? undefined : 'Post sem CTA' });
  if (!allCta) passed = false;

  return passed ? { passed: true, checks } : { passed: false, checks, failedItem: { agent: 'planner', reason: checks.filter(c => !c.passed).map(c => c.message).join('; ') } };
}
