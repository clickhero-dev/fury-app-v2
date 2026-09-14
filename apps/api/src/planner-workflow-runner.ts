import { and, count, eq } from 'drizzle-orm';
import { db, campaignPlans, socialPosts } from '@fury/db';
import { PostgresCheckpointStore } from './services/stateMachine/postgres-checkpoint-store.js';
import type { StageTrace, WorkflowSnapshot } from './services/stateMachine/types.js';
import { openrouterService } from './services/llms/openrouter.service.js';
import { loadPlannerContext } from './services/planner/planner-context.service.js';
import { buildContentDates, generateContentPrompts } from './agents/planner.agent.js';
import { enqueueMissingPlannerPosts, enqueuePlannerImageJobs } from './services/planner/planner-studio.service.js';
import type { PlannerContext, PlannerPrompt } from './agents/types.js';
import { plannerStore } from './planner-store.js';

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

/**
 * Renova o lock do job periodicamente (heartbeat) para evitar expiração
 * pelo stale timeout durante execuções longas.
 */
async function startHeartbeat(jobId: string): Promise<NodeJS.Timeout> {
  // Renovação imediata
  await plannerStore.renewLock(jobId);
  // Depois a cada 30 segundos
  return setInterval(async () => {
    try {
      await plannerStore.renewLock(jobId);
    } catch {
      // Ignorar erros de heartbeat - o job continuará
    }
  }, 30_000);
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

/** Conta os social_posts criados para um plano (usado na verificação de conclusão). */
async function countPlannerPosts(planId: string, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(socialPosts)
    .where(and(eq(socialPosts.planId, planId), eq(socialPosts.tenantId, tenantId)));
  return Number((row as any)?.total ?? 0);
}

/**
 * Fluxo do planejador (worker de planejamento):
 *  1. contexto (brandKit tom/cor) + cidade
 *  2. datas: geradas NO CÓDIGO (espaçamento puro, determinístico — sem LLM)
 *  3. conteúdo: uma chamada LLM com shape achatado ({title, descricao, prompt});
 *     o código faz o zip com data/postType/platform/cta/hashtags
 *  4. enfileira os posts na fila studio-generate-image
 *     (5 — quando cada imagem termina, o worker studio grava o social_post)
 */
export async function runPlannerWorkflow(jobId: string, tenantId: string, postsCountParam: number = 8): Promise<void> {
  // Prerequisito: gate de créditos antes de gastar qualquer LLM.
  await openrouterService.assertCreditsAvailable();

  const stages: StageTrace[] = [];
  const snapshot = await plannerStore.load(jobId);

  // Use postsCount from metadata (for recovery) or parameter (for new execution).
  // `snapshot` pode ser null (execução nova) — NUNCA acessar .metadata sem guard:
  // crash aqui no início do pipeline = job nunca progride e a tela não atualiza.
  const postsCount = (snapshot?.metadata as { postsCount?: number } | undefined)?.postsCount ?? postsCountParam;

  // Já enfileirado (crash/restart após o enfileiramento): verifica a conclusão
  // REAL (posts criados vs esperados) antes de marcar done — e re-enfileira
  // apenas os posts faltantes, sem re-rodar a LLM.
  if (snapshot?.planId && (snapshot.artifacts as any)?.enqueued === true) {
    const plan = await db.query.campaignPlans.findFirst({ where: eq(campaignPlans.id, snapshot.planId) });
    const stored = ((plan?.metadata as any)?.posts ?? []) as PlannerPrompt[];
    const expected = Number((snapshot.artifacts as any)?.expectedPosts ?? stored.length ?? 0);
    const created = await countPlannerPosts(snapshot.planId, tenantId);

    if (expected === 0 || created >= expected) {
      await plannerStore.markDone(jobId, snapshot.planId);
      return;
    }

    if (stored.length > 0) {
      const context = await loadPlannerContext(tenantId);
      await enqueueMissingPlannerPosts({
        tenantId,
        planId: snapshot.planId,
        posts: stored,
        logoUrl: context.brandKit?.logoUrl,
      });
    }
    return;
  }

  // Iniciar heartbeat para evitar expiração do lock durante execução longa
  const heartbeatInterval = await startHeartbeat(jobId);
  let currentStageId = 'context';

  try {
    await setStage(jobId, stages, 'prerequisites', 'COMMITTED');

    // 1. Contexto
    await setStage(jobId, stages, 'context', 'RUNNING');
    const context: PlannerContext = await loadPlannerContext(tenantId);
    await setStage(jobId, stages, 'context', 'COMMITTED');

    // 2+3. Datas (código) + conteúdo (LLM achatado)
    currentStageId = 'planner';
    await setStage(jobId, stages, 'planner', 'RUNNING');
    const dates = buildContentDates(postsCount);
    const posts = await generateContentPrompts(context, dates);
    await setStage(jobId, stages, 'planner', 'COMMITTED');
    if (posts.length === 0) throw new Error('O planejador não retornou nenhum post.');

    // 4. Cria o plano e enfileira as imagens
    currentStageId = 'image-generation';
    await setStage(jobId, stages, 'image-generation', 'RUNNING');
    const planId = snapshot?.planId ?? (await createPlan(tenantId, context.businessName, posts));
    await enqueuePlannerImageJobs({
      tenantId,
      planId,
      posts,
      logoUrl: context.brandKit?.logoUrl,
    });
    await plannerStore.save(jobId, { planId, artifacts: { enqueued: true, expectedPosts: posts.length } });

    // As imagens são geradas de forma assíncrona; cada worker studio grava seu
    // social_post ao concluir. O job marca 'awaiting_images' para aguardar.
    // Para o heartbeat: a execução deste processo terminou — sem isso o lock
    // nunca envelhece e nem recovery-boot nem stale-timeout alcançam o job.
    clearInterval(heartbeatInterval);
    await plannerStore.save(jobId, { status: 'awaiting_images', currentStage: 'image-generation', planId });

  } catch (err) {
    clearInterval(heartbeatInterval);
    const msg = err instanceof Error ? err.message : String(err);
    await plannerStore.markFailed(jobId, currentStageId, msg);
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
    // Verificar se já existe job ativo para este tenant (evita race condition)
    const activeJob = await plannerStore.findActiveByLockKey(snapshot.tenantId, 'planner-generate');
    if (activeJob && activeJob.id !== snapshot.id) {
      console.log(`[planner-recovery] Job ${snapshot.id} ignorado: outro job ativo para tenant ${snapshot.tenantId}`);
      continue;
    }
    console.log(`[planner-recovery] retomando job ${snapshot.id}`);
    const postsCount = (snapshot?.metadata as { postsCount?: number } | undefined)?.postsCount ?? 8;
    void runPlannerWorkflow(snapshot.id, snapshot.tenantId, postsCount).catch((err) => {
      console.error(`[planner-recovery] job ${snapshot.id} falhou ao retomar:`, err);
    });
    resumed += 1;
  }
  return resumed;
}

export type { WorkflowSnapshot };