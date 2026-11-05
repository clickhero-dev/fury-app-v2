import type { ArtifactMap, ProgressCallback, RetryPolicy, StageStatus, StageTrace } from './types.js';

/**
 * Interface de contrato entre o workflow e um stage específico.
 * O stage controla sua execução, rollback, retry, validação e a geração
 * do artefato que será persistido como checkpoint.
 */
export interface StageInterface<TCtx = unknown, TOut = unknown> {
  readonly id: string;
  status: StageStatus;
  retryPolicy?: RetryPolicy;
  idempotent?: boolean;

  /** Executa o stage e retorna o artefato gerado. */
  execute(ctx: TCtx, artifacts: ArtifactMap): Promise<TOut>;

  /** Gera o artefato a partir do resultado da execução. */
  generateArtifact(result: TOut): Promise<unknown>;

  /** Valida o artefato gerado (ex.: quality gate, compliance). */
  validate(artifact: unknown): Promise<boolean>;

  /** Remove os resíduos deixados por este stage em caso de falha/rollback. */
  rollback(ctx: TCtx, artifacts: ArtifactMap): Promise<boolean>;

  /** Aplica a política de retry para tentar executar novamente. */
  retry(): Promise<boolean>;

  updateStatus(status: StageStatus): void;
}

/**
 * Contrato de gerenciamento de um workflow.
 * O workflow controla a execução ordenada dos stages, aplicando políticas
 * de retry, rollback e validação sobre o estado persistido.
 */
export interface WorkflowInterface<TCtx = unknown> {
  readonly id: string;
  readonly stages: StageInterface<TCtx>[];
  execute(ctx: TCtx, onProgress?: ProgressCallback): Promise<boolean>;
  retry(): Promise<boolean>;
  validate(): Promise<boolean>;
  rollback(): Promise<boolean>;
}

/** Definição declarativa e reutilizável de um stage de um workflow. */
export interface StageDefinition<TCtx = unknown, TOut = unknown> {
  id: string;
  deps?: string[];
  execute(ctx: TCtx, artifacts: ArtifactMap): Promise<TOut>;
  generateArtifact?: (result: TOut) => unknown | Promise<unknown>;
  validate?(artifact: TOut): Promise<boolean>;
  rollback?(ctx: TCtx, artifacts: ArtifactMap): Promise<void>;
  retryPolicy?: RetryPolicy;
  artifactKey: string;
  idempotent?: boolean;
}

/** Definição declarativa de um workflow, pronta para ser registrada. */
export interface WorkflowDefinition<TCtx = unknown> {
  id: string;
  stages: StageDefinition<TCtx, unknown>[];
  defaultRetry?: RetryPolicy;
  lockKey(ctx: TCtx): string;
  /** Hook executado ao final de todos os stages — permite derivar IDs de resultado (ex.: planId). */
  finalize?(ctx: TCtx, artifacts: ArtifactMap): Promise<{ planId?: string }> | { planId?: string };
  trace?: StageTrace;
}