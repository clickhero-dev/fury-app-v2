import { getStudioQueue } from '../../lib/queue.js';
import type { PlannerPrompt } from '../../agents/types.js';
import type { StudioGenerationJobData } from '../studio/studio.service.js';

export interface EnqueuePlannerImageJobsParams {
  tenantId: string;
  planId: string;
  posts: PlannerPrompt[];
  logoUrl?: string;
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