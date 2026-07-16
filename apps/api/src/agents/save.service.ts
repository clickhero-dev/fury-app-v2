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
  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

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
      return {
        tenantId,
        planId: plan.id,
        platform: p.platform === 'both' ? 'instagram' : p.platform,
        postType: p.postType === 'reel' ? 'image' as any : p.postType as any,
        title: p.title,
        caption: copy?.caption ?? '',
        cta: copy?.cta ?? '',
        hashtags: copy?.hashtags ?? [],
        imagePrompt: cr?.imagePrompt ?? '',
        dayIndex: p.dayIndex,
        status: 'draft' as const,
      };
    });
    await db.insert(socialPosts).values(merged as any);
  }

  return plan.id;
}
