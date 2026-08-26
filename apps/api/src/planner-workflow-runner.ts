import { db, campaignPlans } from '@fury/db';
import { PostgresCheckpointStore } from './services/stateMachine/postgres-checkpoint-store.js';
import type { StageTrace, WorkflowSnapshot } from './services/stateMachine/types.js';
import { openrouterService } from './services/llms/openrouter.service.js';
import { loadPlannerContext } from './services/planner/planner-context.service.js';
import { researchImportantDates, generateContentPrompts } from './agents/planner.agent.js';
import { enqueuePlannerImageJobs } from './services/planner/planner-studio.service.js';
import type { PlannerContext, PlannerPrompt } from './agents/types.js';

export const plannerStore = new PostgresCheckpointStore();

function trace(stageId: string, status: StageTrace['status']): StageTrace {
  return { stageId, status, attempts: 1, startedAt: new Date().toISOString() };
}

function withStage(stages: StageTrace[], t: StageTrace): StageTrace[] {
  const idx = stages.findIndex((s) => s.stageId === t.stageId);
  if (idx >= 0) stages[idx] = t;
  else stages.push(t);
  return stages;
}

async function setStage(
  jobId: string,
  stages: StageTrace[],
  stageId: string,
  status: StageTrace['status'],
): Promise<void> {
  await plannerStore.save(jobId, {
    status: status === 'FAILED' ? 'error' : 'running',
    currentStage: status === 'COMMITTED' ? null : stageId,
    stages: withStage(stages, trace(stageId, status)),
  });
}

async function createPlan(tenantId: string, businessName: string, posts: PlannerPrompt[]): Promise<string> {
  const dates = posts.map((p) => p.date).sort();
  const [plan] = await db.insert(campaignPlans)
    .values({
      tenantId,
      title: `Plano - ${businessName}`,
      type: 'monthly',
      periodStart: dates[0] ? new Date(`${dates[0]}T12:00:00Z`) : null,
      periodEnd: dates[dates.length - 1] ? new Date(`${dates[dates.length - 1]}T12:00:00Z`) : null,
      totalPosts: posts.length,
      status: 'draft',
      metadata: { generatedBy: 'langchain-planner', posts } as any,
    })
    .returning();
  return plan.id;
}

/**
 * Fluxo langchain do planejador (worker de planejamento):
 *  2.1 contexto (brandKit tom/cor) + cidade
 *  2.2 pesquisa de datas relevantes (cidade/nicho) — modelo, sem busca externa
 *  2.3 cria 8 prompts estruturados (data, imagem, legenda, CTA)
 *  2.4 enfileira os 8 prompts na fila studio-generate-image
 *      (2.5 — quando cada imagem termina, o worker studio grava o social_post)
 */
export async function runPlannerWorkflow(jobId: string, tenantId: string): Promise<void> {
  // Prerequisito: gate de créditos antes de gastar qualquer LLM.
  await openrouterService.assertCreditsAvailable();

  const stages: StageTrace[] = [];
  const snapshot = await plannerStore.load(jobId);

  // Já concluído (crash/restart após o enfileiramento): nada a refazer.
  if (snapshot?.planId && (snapshot.artifacts as any)?.enqueued === true) {
    await plannerStore.markDone(jobId, snapshot.planId);
    return;
  }

  try {
    await setStage(jobId, stages, 'prerequisites', 'COMMITTED');

    // 2.1 Contexto
    await setStage(jobId, stages, 'context', 'RUNNING');
    const context: PlannerContext = await loadPlannerContext(tenantId);
    await setStage(jobId, stages, 'context', 'COMMITTED');

    // 2.2 Datas importantes/relevantes (cidade + nicho)
    await setStage(jobId, stages, 'research', 'RUNNING');
    const dates = await researchImportantDates(context);
    await setStage(jobId, stages, 'research', 'COMMITTED');

    // 2.3 Prompt de conteúdo (8 posts estruturados)
    await setStage(jobId, stages, 'planner', 'RUNNING');
    const posts = await generateContentPrompts(context, dates);
    await setStage(jobId, stages, 'planner', 'COMMITTED');
    if (posts.length === 0) throw new Error('O planejador não retornou nenhum post.');

    // Cria o plano e enfileira as imagens
    await setStage(jobId, stages, 'image-generation', 'RUNNING');
    const planId = snapshot?.planId ?? (await createPlan(tenantId, context.businessName, posts));
    await enqueuePlannerImageJobs({
      tenantId,
      planId,
      posts,
      logoUrl: context.brandKit?.logoUrl,
    });
    await plannerStore.save(jobId, { planId, artifacts: { enqueued: true } });

    // As imagens são geradas de forma assíncrona; cada worker studio grava seu
    // social_post ao concluir. O job marca 'done' aqui.
    await plannerStore.markDone(jobId, planId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await plannerStore.markFailed(jobId, snapshot?.currentStage ?? 'context', msg);
    throw err;
  }
}

/** Recupera jobs interrompidos (crash/restart) — chamado no boot do servidor. */
export async function recoverInterruptedPlannerWorkflows(): Promise<number> {
  const recoverable = await plannerStore.listRecoverable({
    workflow: 'planner-generate',
    sinceMs: 30_000,
  });

  let resumed = 0;
  for (const snapshot of recoverable) {
    console.log(`[planner-recovery] retomando job ${snapshot.id}`);
    void runPlannerWorkflow(snapshot.id, snapshot.tenantId).catch((err) => {
      console.error(`[planner-recovery] job ${snapshot.id} falhou ao retomar:`, err);
    });
    resumed += 1;
  }
  return resumed;
}

export type { WorkflowSnapshot };