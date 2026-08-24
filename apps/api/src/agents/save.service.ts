import { db, campaignPlans, socialPosts } from '@fury/db';
import type { AgentContext, ResearchOutput, AnalyticsOutput, StrategyOutput, PlannerOutput, CopywriterOutput, CreativeOutput, QualityOutput, SchedulerOutput, BrandingOutput, ImageGenerationOutput } from './types.js';

/**
 * Computa a "data efetiva" de um post de plano para calendar_date.
 * Regra: periodStart + (dayIndex-1) dias, clampado ao último dia do mês de periodStart.
 * Retorna ISO date string 'YYYY-MM-DD' ou null se dayIndex for inválido.
 */
function computeCalendarDate(periodStart: Date, dayIndex: number | null): string | null {
  if (!dayIndex || dayIndex < 1) return null;

  // Extrai ano/mês de periodStart em UTC
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth();

  // Calcula último dia do mês
  const lastDayOfMonth = new Date(year, month + 1, 0).getUTCDate();
  const clampedDay = Math.min(dayIndex, lastDayOfMonth);

  // Retorna ISO date string em UTC (exatamente no formato que calendar_date espera)
  const date = new Date(Date.UTC(year, month, clampedDay));
  return date.toISOString().split('T')[0];
}

export interface savePlanToDbInput {
  tenantId: string;
  context: AgentContext;
  research: ResearchOutput;
  analytics: AnalyticsOutput;
  strategy: StrategyOutput;
  planner: PlannerOutput;
  copywriter: CopywriterOutput;
  creative: CreativeOutput;
  images?: ImageGenerationOutput;
  quality: QualityOutput;
  scheduler: SchedulerOutput;
  branding: BrandingOutput;
}

export async function savePlanToDb(input: savePlanToDbInput): Promise<string> {
  const { tenantId, context, research, analytics, strategy, planner, copywriter, creative, images, quality, scheduler, branding } = input;

  // Calcula d+1 (amanhã) como dia mínimo válido
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const minDayIndex = tomorrow.getDate();
  const maxDayIndex = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const metadata = { summary: planner.summary, research, analytics, strategy, quality, scheduler, branding, images } as Record<string, unknown>;

  const [plan] = await db.insert(campaignPlans).values({
    tenantId,
    title: 'Plano - ' + context.tenant.name,
    type: 'monthly',
    objective: strategy.objective,
    periodStart,
    periodEnd,
    totalPosts: planner.totalPosts,
    metadata: metadata as any,
    status: 'draft',
  }).returning();

  if (planner.posts.length > 0) {
    const merged = planner.posts.map(p => {
      // Validação de segurança: dayIndex deve ser >= d+1 e <= último dia do mês
      const safeDayIndex = Math.max(minDayIndex, Math.min(maxDayIndex, p.dayIndex));

      const copy = copywriter.posts.find(c => c.dayIndex === p.dayIndex);
      const cr = creative.posts.find(c => c.dayIndex === p.dayIndex);
      const img = images?.posts.find(i => i.dayIndex === p.dayIndex);
      return {
        tenantId,
        planId: plan.id,
        platform: p.platform === 'both' ? 'instagram' : p.platform,
        postType: p.postType as any,
        title: p.title,
        caption: copy?.caption ?? '',
        cta: copy?.cta ?? '',
        hashtags: copy?.hashtags ?? [],
        imagePrompt: cr?.imagePrompt ?? '',
        imageUrl: img?.imageUrl ?? '',
        dayIndex: safeDayIndex,
        calendarDate: computeCalendarDate(periodStart, safeDayIndex),
        status: 'draft' as const,
      };
    });
    await db.insert(socialPosts).values(merged as any);
  }

  return plan.id;
}
