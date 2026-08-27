import { getStudioQueue } from '../../lib/queue.js';
import type { PlannerPrompt } from '../../agents/types.js';
import type { StudioGenerationJobData } from '../studio/studio.service.js';
import { plannerStore } from '../../planner-store.js';
import { PlannerRepository } from '../../repository/planner.repository.js';

export interface EnqueuePlannerImageJobsParams {
  tenantId: string;
  planId: string;
  posts: PlannerPrompt[];
  logoUrl?: string;
}

/**
 * Verifica se todos os socialPosts do plano foram criados e, se sim,
 * marca o job do planner como 'done'. O número esperado vem do artifact
 * `expectedPosts` (gravado no momento do enfileiramento) para nunca
 * depender de um valor fixo (ex: 8) que não reflita o plano real.
 */
export async function checkAndCompletePlannerJob(planId: string, tenantId: string, expectedCount?: number): Promise<void> {
  const repo = new PlannerRepository(tenantId);
  const createdCount = await repo.countPostsByPlan(planId);

  // Prioridade: artifact do job > parâmetro (caller) > fallback 8
  let expected = expectedCount;
  const job = await plannerStore.findByPlanId(planId);
  if (job) {
    const artifactExpected = Number((job.artifacts as any)?.expectedPosts ?? 0);
    if (artifactExpected > 0) expected = artifactExpected;
  }
  const expectedPosts = expected ?? 8;

  if (createdCount >= expectedPosts) {
    if (job && job.status === 'awaiting_images') {
      await plannerStore.markDone(job.id, planId);
    }
  }
}

/**
 * Etapa 2.4 do fluxo: enfileira um job por prompt na fila studio-generate-image.
 * O worker (modo planner) gera a imagem real e, ao concluir, grava o social_post
 * no calendário (etapa 2.5).
 */
export async function enqueuePlannerImageJobs({
  tenantId,
  planId,
  posts,
  logoUrl,
}: EnqueuePlannerImageJobsParams): Promise<void> {
  const queue = await getStudioQueue();

  for (const post of posts) {
    const payload: StudioGenerationJobData = {
      mode: 'planner',
      tenantId,
      planId,
      post,
      logoUrl,
    };
    await queue.add('generate', payload, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });
  }
}

/**
 * Recuperação: re-enfileira APENAS os posts do plano que ainda não têm
 * social_post criado (idempotente — o worker studio já é idempotente por
 * (planId, calendarDate, postType)). Evita re-rodar a LLM e evita duplicatas.
 * Retorna quantos posts foram re-enfileirados.
 */
export async function enqueueMissingPlannerPosts(params: {
  tenantId: string;
  planId: string;
  posts: PlannerPrompt[];
  logoUrl?: string;
}): Promise<number> {
  const repo = new PlannerRepository(params.tenantId);
  const existingKeys = new Set(await repo.listPostKeysByPlan(params.planId));
  const missing = params.posts.filter((p) => !existingKeys.has(`${p.date}:${p.postType}`));

  if (missing.length > 0) {
    await enqueuePlannerImageJobs({
      tenantId: params.tenantId,
      planId: params.planId,
      posts: missing,
      logoUrl: params.logoUrl,
    });
  }
  return missing.length;
}