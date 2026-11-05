import type { CheckpointStore } from './checkpoint-store.js';
import type {
  ArtifactMap,
  ProgressCallback,
  StageEvent,
  StageTrace,
  WorkflowSnapshot,
} from './types.js';
import type { StageDefinition, WorkflowDefinition } from './stageInterface.js';
import { hasAttemptsRemaining, resolveRetryPolicy, sleepBackoff } from './retry.policy.js';

/**
 * Error lançado quando um workflow atinge falha terminal após esgotar retries.
 * Carrega o stage falho e o motivo para auditoria e decisão de recuperação.
 */
export class WorkflowFailedError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly stageId: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowFailedError';
  }
}

/**
 * Error lançado por um stage para sinalizar que uma dependência precisa ser
 * re-executada antes de tentar novamente (ex.: quality não passou → refaz copywriter).
 */
export class RetryDependencyError extends Error {
  constructor(public readonly dependencyId: string, message: string) {
    super(message);
    this.name = 'RetryDependencyError';
  }
}

interface RunOptions<TCtx> {
  onProgress?: ProgressCallback;
  /** Pulo de recuperação: pule stages já commitados e retome do primeiro não-commitado. */
  resume?: boolean;
}

/**
 * Motor de workflow (state machine / saga).
 *
 * Executa os stages de um WorkflowDefinition em ordem (respeitando deps),
 * aplicando política de retry, validando artefatos e persistindo checkpoints
 * a cada transição — garantindo recuperação de um estado confiável.
 *
 * Genérico e agnóstico de domínio: não conhece planner, agentes ou JobStatus.
 */
export class WorkflowEngine<TCtx> {
  constructor(
    private readonly definition: WorkflowDefinition<TCtx>,
    private readonly store: CheckpointStore,
  ) {}

  /** Executa (ou retoma) o workflow a partir de um checkpoint existente. */
  async run(jobId: string, ctx: TCtx, opts: RunOptions<TCtx> = {}): Promise<void> {
    const snapshot = opts.resume
      ? await this.store.load(jobId)
      : null;

    const current = snapshot && snapshot.status === 'running'
      ? snapshot
      : null;

    await this.ensureRunning(jobId, ctx, current);

    const stages = this.topologicalOrder();
    const { stages: traces, artifacts } = current ?? { stages: [] as StageTrace[], artifacts: {} as ArtifactMap };

    const progress = (event: StageEvent) => opts.onProgress?.(event);

    for (const stage of stages) {
      const trace = traces.find((t) => t.stageId === stage.id);

      // Recuperação: stages já commitados são preservados (evita reprocessamento).
      if (current && trace && trace.status === 'COMMITTED') {
        continue;
      }

      const prevAttempts = trace?.attempts ?? 0;
      await this.updateTrace(jobId, stage.id, {
        status: 'RUNNING',
        attempts: prevAttempts,
        startedAt: new Date().toISOString(),
        committedAt: undefined,
        error: undefined,
      });
      progress({ stageId: stage.id, status: 'RUNNING', attempts: prevAttempts, pct: this.pct(stage.id) });

      const policy = resolveRetryPolicy(stage.retryPolicy, this.definition.defaultRetry);
      let attempts = prevAttempts;

      try {
        let ok = false;
        let lastError: unknown;

        while (attempts < policy.maxAttempts) {
          attempts += 1;
          try {
            const result = await stage.execute(ctx, artifacts);

            const artifactValue = stage.generateArtifact
              ? await stage.generateArtifact(result)
              : result;

            if (stage.validate) {
              const valid = await stage.validate(artifactValue);
              if (!valid) {
                throw new Error(`Stage ${stage.id} falhou na validação`);
              }
            }

            artifacts[stage.artifactKey] = artifactValue;

            const mergedTraces = this.mergeTrace(traces, stage.id, {
              status: 'COMMITTED',
              attempts,
              committedAt: new Date().toISOString(),
              error: undefined,
            });
            traces.length = 0;
            traces.push(...mergedTraces);

            await this.store.save(jobId, {
              currentStage: stage.id,
              stages: mergedTraces,
              artifacts: { ...artifacts },
            });
            progress({ stageId: stage.id, status: 'COMMITTED', attempts, pct: this.pct(stage.id) });

            ok = true;
            break;
          } catch (err) {
            lastError = err;

            // Quality gate: re-executa a dependência (ex.: copywriter) antes de retentar.
            if (err instanceof RetryDependencyError) {
              await this.reexecuteDependency(jobId, stage, err.dependencyId, ctx, artifacts, traces);
            }

            const canRetry = hasAttemptsRemaining(attempts, policy);

            await this.updateTrace(jobId, stage.id, {
              status: canRetry ? 'RUNNING' : 'FAILED',
              attempts,
              error: err instanceof Error ? err.message : String(err),
            });

            if (canRetry) {
              progress({ stageId: stage.id, status: 'RUNNING', attempts, pct: this.pct(stage.id), error: this.errorMessage(lastError) });
              await sleepBackoff(attempts, policy);
            } else {
              progress({ stageId: stage.id, status: 'FAILED', attempts, pct: this.pct(stage.id), error: this.errorMessage(lastError) });
            }
          }
        }

        if (!ok) {
          throw lastError ?? new Error(`Stage ${stage.id} falhou após ${attempts} tentativas`);
        }
      } catch (err) {
        // Falha terminal do stage: rollback do stage + marca job como error.
        const errorMessage = this.errorMessage(err);

        try {
          await stage.rollback?.(ctx, artifacts);
        } catch (rollbackErr) {
          console.error(`[workflow:${this.definition.id}] rollback do stage ${stage.id} falhou:`, rollbackErr);
        }

        await this.store.markFailed(jobId, stage.id, errorMessage);
        throw new WorkflowFailedError(jobId, stage.id, errorMessage);
      }
    }

    const finalArtifacts = artifacts;
    let planId: string | undefined;
    if (this.definition.finalize) {
      const result = await this.definition.finalize(ctx, finalArtifacts);
      planId = result.planId;
    }

    await this.store.markDone(jobId, planId ?? '');
    progress({ stageId: 'workflow', status: 'COMPLETED', attempts: 1, pct: 100 });
  }

  /** Rollback do workflow: executa rollback dos stages commitados em ordem reversa e marca job como error. */
  async rollback(jobId: string, ctx: TCtx, reason = 'rollback manual'): Promise<void> {
    const snapshot = await this.store.load(jobId);
    if (!snapshot) return;

    const stages = this.topologicalOrder();
    const committed = stages
      .filter((s) => snapshot.stages.some((t) => t.stageId === s.id && t.status === 'COMMITTED'))
      .reverse();

    for (const stage of committed) {
      try {
        await stage.rollback?.(ctx, snapshot.artifacts);
      } catch (err) {
        console.error(`[workflow:${this.definition.id}] rollback do stage ${stage.id} falhou:`, err);
      }
    }

    await this.store.markFailed(jobId, 'rollback', reason);
  }

  /** Lista jobs passíveis de recuperação (para boot do servidor). */
  async listRecoverable(opts?: { workflow?: string; sinceMs?: number }): Promise<WorkflowSnapshot[]> {
    return this.store.listRecoverable(opts);
  }

  private async reexecuteDependency(
    jobId: string,
    stage: StageDefinition<TCtx, unknown>,
    dependencyId: string,
    ctx: TCtx,
    artifacts: ArtifactMap,
    traces: StageTrace[],
  ): Promise<void> {
    const dep = this.definition.stages.find((s) => s.id === dependencyId);
    if (!dep) throw new Error(`Dependency ${dependencyId} não encontrada para re-execução (stage ${stage.id})`);

    const result = await dep.execute(ctx, artifacts);
    const artifactValue = dep.generateArtifact ? await dep.generateArtifact(result) : result;
    artifacts[dep.artifactKey] = artifactValue;

    const mergedTraces = this.mergeTrace(traces, dep.id, {
      status: 'COMMITTED',
      attempts: (traces.find((t) => t.stageId === dep.id)?.attempts ?? 0) + 1,
      committedAt: new Date().toISOString(),
      error: undefined,
    });
    traces.length = 0;
    traces.push(...mergedTraces);

    await this.store.save(jobId, {
      currentStage: dep.id,
      stages: mergedTraces,
      artifacts: { ...artifacts },
    });
  }

  private topologicalOrder(): StageDefinition<TCtx, unknown>[] {
    const stages = this.definition.stages;
    const visited = new Set<string>();
    const result: StageDefinition<TCtx, unknown>[] = [];
    const byId = new Map(stages.map((s) => [s.id, s]));

    const visit = (stage: StageDefinition<TCtx, unknown>) => {
      if (visited.has(stage.id)) return;
      visited.add(stage.id);
      for (const dep of stage.deps ?? []) {
        const depStage = byId.get(dep);
        if (depStage) visit(depStage);
      }
      result.push(stage);
    };

    for (const stage of stages) visit(stage);
    return result;
  }

  private async ensureRunning(jobId: string, ctx: TCtx, current: WorkflowSnapshot | null): Promise<void> {
    void ctx;
    if (current) return;
    await this.store.save(jobId, { status: 'running', currentStage: null, error: undefined });
  }

  private pct(stageId: string): number {
    const idx = this.definition.stages.findIndex((s) => s.id === stageId);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / this.definition.stages.length) * 100);
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private mergeTrace(traces: StageTrace[], stageId: string, patch: Partial<StageTrace>): StageTrace[] {
    const existing = traces.find((t) => t.stageId === stageId);
    const next = { ...(existing ?? { stageId, status: 'PENDING' as const, attempts: 0, startedAt: new Date().toISOString() }), ...patch };
    return [...traces.filter((t) => t.stageId !== stageId), next];
  }

  private async updateTrace(jobId: string, stageId: string, patch: Partial<StageTrace>): Promise<void> {
    const snapshot = await this.store.load(jobId);
    if (!snapshot) return;
    await this.store.save(jobId, {
      currentStage: stageId,
      stages: this.mergeTrace(snapshot.stages, stageId, patch),
    });
  }
}