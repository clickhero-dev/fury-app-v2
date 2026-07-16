import { db, campaignPlans, socialPosts } from '@fury/db';
import { eq, and } from 'drizzle-orm';
import { jobs, generateId, runPipeline } from '../agents/orchestrator.js';
import type { JobStatus } from '../agents/types.js';

export { jobs } from '../agents/orchestrator.js';

export function startPlanGeneration(tenantId: string): JobStatus {
  const id = generateId();
  const status: JobStatus = {
    id,
    tenantId,
    status: 'running',
    currentAgent: 'Context Agent',
    agentProgress: [{ name: 'Context Agent', status: 'running', pct: 5 }],
  };
  jobs.set(id, status as any);

  runPipeline(tenantId, id).catch(() => {
    const j = jobs.get(id);
    if (j) {
      j.status = 'error';
      j.error = j.error || 'Pipeline error';
    }
  });

  return jobs.get(id) as JobStatus;
}

export function getJobProgress(jobId: string): JobStatus | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  return job as JobStatus;
}

export async function getPlanById(planId: string, tenantId: string) {
  return db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
    with: { posts: true },
  });
}

export async function confirmPlan(planId: string, tenantId: string) {
  const [plan] = await db.update(campaignPlans)
    .set({ status: 'active' })
    .where(and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)))
    .returning();
  if (!plan) throw new Error('Plano não encontrado');
  await db.update(socialPosts)
    .set({ status: 'approved' })
    .where(eq(socialPosts.planId, planId));
  return plan;
}

export async function revalidatePlan(planId: string, tenantId: string, updates: Record<string, any>) {
  const plan = await db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
  });
  if (!plan) throw new Error('Plano não encontrado');
  const currentMeta = (plan.metadata || {}) as Record<string, any>;
  const newMeta = { ...currentMeta, ...updates, revalidatedAt: new Date().toISOString() };
  const [updated] = await db.update(campaignPlans)
    .set({ metadata: newMeta as any })
    .where(eq(campaignPlans.id, planId))
    .returning();
  return updated;
}
