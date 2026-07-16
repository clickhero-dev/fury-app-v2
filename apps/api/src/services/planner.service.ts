import { db, campaignPlans, socialPosts } from '@fury/db';
import { eq, and } from 'drizzle-orm';
import { jobs, generateId, runPipeline } from '../agents/orchestrator.js';
import { openrouterService } from './openrouter.service.js';
import type { JobStatus } from '../agents/types.js';
import { AppError } from '../middleware/errorHandler.js';

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
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
  await db.update(socialPosts)
    .set({ status: 'approved' })
    .where(eq(socialPosts.planId, planId));
  return plan;
}

export async function revalidatePlan(planId: string, tenantId: string, updates: Record<string, any>) {
  const plan = await db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
  });
  if (!plan) throw new AppError(404, 'NOT_FOUND', 'Plano não encontrado');
  const currentMeta = (plan.metadata || {}) as Record<string, any>;
  const newMeta = { ...currentMeta, ...updates, revalidatedAt: new Date().toISOString() };
  const [updated] = await db.update(campaignPlans)
    .set({ metadata: newMeta as any })
    .where(eq(campaignPlans.id, planId))
    .returning();
  return updated;
}

export async function editPostWithAI(postId: string, tenantId: string, prompt: string) {
  const post = await db.query.socialPosts.findFirst({
    where: and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)),
  });
  if (!post) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado');

  const systemPrompt = `Você é um copywriter sênior de redes sociais. Edite o post abaixo seguindo EXATAMENTE a instrução do usuário. Mantenha o tom de voz profissional e adequado para negócios locais.

Post atual:
Título: ${post.title ?? '—'}
Legenda: ${post.caption ?? '—'}
CTA: ${post.cta ?? '—'}
Hashtags: ${JSON.stringify(post.hashtags ?? [])}

Instrução do usuário: ${prompt}

Retorne APENAS JSON neste formato exato (sem markdown, sem comentários):
{"caption": "...nova legenda...", "cta": "...novo cta...", "hashtags": ["#tag1", "#tag2"]}`;

  const raw = await openrouterService.chat(
    [{ role: 'system', content: systemPrompt }],
    { temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } },
  );

  let updates: Record<string, any>;
  try {
    updates = JSON.parse(raw);
  } catch {
    throw new AppError(502, 'AI_PARSE_ERROR', 'Resposta da IA inválida ao editar post');
  }

  const [updated] = await db.update(socialPosts)
    .set({
      caption: typeof updates.caption === 'string' ? updates.caption : post.caption,
      cta: typeof updates.cta === 'string' ? updates.cta : post.cta,
      hashtags: Array.isArray(updates.hashtags) ? updates.hashtags : post.hashtags,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();

  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Post não encontrado ao atualizar');
  return updated;
}
