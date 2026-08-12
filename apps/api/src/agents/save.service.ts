import { db, campaignPlans, socialPosts } from '@fury/db';
import type { AgentContext, ResearchOutput, AnalyticsOutput, StrategyOutput, PlannerOutput, CopywriterOutput, CreativeOutput, QualityOutput, SchedulerOutput, BrandingOutput } from './types.js';

export interface savePlanToDbInput {
  tenantId: string;
  context: AgentContext;
  research: ResearchOutput;
  analytics: AnalyticsOutput;
  strategy: StrategyOutput;
  planner: PlannerOutput;
  copywriter: CopywriterOutput;
  creative: CreativeOutput;
  quality: QualityOutput;
  scheduler: SchedulerOutput;
  branding: BrandingOutput;
}

export async function savePlanToDb(input: savePlanToDbInput): Promise<string> {
  const { tenantId, context, research, analytics, strategy, planner, copywriter, creative, quality, scheduler, branding } = input;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const metadata = { summary: planner.summary, research, analytics, strategy, quality, scheduler, branding } as Record<string, unknown>;

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
      const copy = copywriter.posts.find(c => c.dayIndex === p.dayIndex);
      const cr = creative.posts.find(c => c.dayIndex === p.dayIndex);

      // Calcula scheduledAt baseado no dayIndex do mês atual
      // Horário padrão: 12:00 (horário de pico)
      const scheduledDate = new Date(now.getFullYear(), now.getMonth(), p.dayIndex, 12, 0, 0);
      // Se o dia já passou ou é hoje, agenda para o próximo mês (mínimo d+1)
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      if (scheduledDate < tomorrow) {
        scheduledDate.setMonth(scheduledDate.getMonth() + 1);
      }

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
        imageUrl: cr?.imageUrl ?? null,
        dayIndex: p.dayIndex,
        scheduledAt: scheduledDate,
        status: 'draft' as const,
      };
    });
    await db.insert(socialPosts).values(merged as any);
  }

  return plan.id;
}
