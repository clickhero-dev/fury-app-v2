# Workflow Engine (State Machine / Saga)

Motor de execução de workflows com **checkpoints auditáveis**, **retry
configurável**, **rollback** e **recuperação de estado confiável**. É uma
implementação do padrão **saga / state machine** adaptada a pipelines de IA
(agentes encadeados).

Genérico e **agnóstico de domínio**: a engine não sabe o que é planner,
agente ou `JobStatus`. Ela apenas executa stages, persiste checkpoints e
garante retomada.

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Trabalho com checkpoints                        │
│                                                                        │
│  ┌─────────────────────┐                                              │
│  │   Worker BullMQ      │  consume job → runPlannerWorkflow(jobId)    │
│  │  (planner.worker)    │                                              │
│  └──────────┬──────────┘                                              │
│             ▼                                                          │
│  ┌─────────────────────┐                                              │
│  │  WorkflowEngine      │  executa stages em ordem (deps DAG),         │
│  │  (workflow.engine)   │  retry, rollback, finalize                   │
│  └──────────┬──────────┘                                              │
│             ▼                                                          │
│  ┌─────────────────────┐        ┌───────────────────────────┐        │
│  │  CheckpointStore     │◄──────│ workflow_jobs (Postgres)  │        │
│  │  (interface)         │        │ stages[], artifacts jsonb│        │
│  └─────────────────────┘        └───────────────────────────┘        │
│                                                                        │
│  ┌─────────────────────┐                                              │
│  │  WorkflowRegistry    │  id → WorkflowDefinition (para recuperação) │
│  └─────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────┘
```

## Conceitos

### `WorkflowDefinition<T>`

Definição declarativa de um workflow:

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador persistido em `workflow_jobs.workflow` (usado na recuperação) |
| `stages` | Lista de `StageDefinition` (ordem + `deps` formam um DAG) |
| `defaultRetry` | Política de retry padrão para todos os stages (pode ser sobrescrita por stage) |
| `lockKey(ctx)` | Chave de lock de concorrência (ex.: `ctx.tenantId` — impede 2 jobs ativos do mesmo tenant) |
| `finalize?` | Hook executado ao fim de todos os stages — deriva IDs de resultado (ex.: `planId`) |

### `StageDefinition<T>`

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador do stage (também usado como agente no frontend) |
| `deps?` | IDs de stages que precisam estar `COMMITTED` antes deste rodar |
| `execute(ctx, artifacts)` | Executa o stage e retorna o resultado |
| `generateArtifact?` | Converte o resultado em artefato persistível |
| `validate?(artifact)` | Valida o artefato (quality gate) |
| `rollback?(ctx, artifacts)` | Remove resíduos deste stage (chamado em falha/rollback) |
| `retryPolicy?` | Política de retry específica (sobrescreve `defaultRetry`) |
| `artifactKey` | **Obrigatório** — nome da chave no mapa de artefatos (checkpoint) |
| `idempotent?` | Campo declarativo (reservado) — sinaliza stage que pode rodar mais de uma vez sem efeito duplicado |

### Artefatos (`ArtifactMap`)

`Record<string, unknown>`. Cada stage grava seu resultado em `artifactKey`.
O mapa completo é persistido a cada transição — é o que permite a recuperação
sem reprocessar stages já commitados.

### Traces (`StageTrace[]`)

Histórico auditável de cada stage:

```ts
{ stageId, status, attempts, error?, startedAt, committedAt? }
```

| Status | Significado |
|--------|-------------|
| `PENDING` | Nunca iniciado |
| `RUNNING` | Em execução (ou aguardando retry) |
| `COMMITTED` | Concluído e persistido (pulável na recuperação) |
| `FAILED` | Esgotou tentativas |

O status global do job (`workflow_status`): `pending | running | done | error`.

## Persistência

Tabela única `workflow_jobs` (migração `0030_workflow_jobs.sql`):

| Coluna | Descrição |
|--------|-----------|
| `id` | UUID do job |
| `tenant_id` | Tenant dono |
| `workflow` | ID do workflow (registry) |
| `status` | `pending / running / done / error` |
| `lock_key` | Lock de concorrência |
| `current_stage` | Stage ativo no momento |
| `stages` | `jsonb` — histórico `StageTrace[]` |
| `artifacts` | `jsonb` — artefatos produzidos |
| `error` | Mensagem da última falha |
| `plan_id` | Resultado (se aplicável) |
| `created_at` / `updated_at` | Timestamps |

O `CheckpointStore` é uma interface — implementações plugáveis:

- [`PostgresCheckpointStore`](../../apps/api/src/services/stateMachine/postgres-checkpoint-store.ts) — produção (drizzle)
- [`InMemoryCheckpointStore`](../../apps/api/src/services/stateMachine/checkpoint-store.ts) — testes

## Ciclo de vida de um stage

```
stage.execute ──► result ──► generateArtifact ──► validate?
                                                     │
                                        (válido)     ▼
                                          artifacts[key] = valor
                                          stages: COMMITTED (checkpoint)
                                                     │
                                          progress({stageId, COMMITTED})

  (falha / validate false)
        │
        ▼
  RetryDependencyError? ──► reexecuta dependência (checkpoint) ──► retry do stage
        │
        ▼
  hasAttemptsRemaining? ──yes──► RUNNING + sleepBackoff ──► nova tentativa
        │
       no
        ▼
  FAILED (persistido) ──► stage.rollback (remove resíduos)
        │
        ▼
  markFailed(job) ──► throw WorkflowFailedError
```

## Retry

Política resolvida: `stage.retryPolicy` tem precedência sobre `defaultRetry`.

| `backoffType` | Fórmula do delay |
|---------------|------------------|
| `fixed` | `backoffMs` |
| `exponential` | `backoffMs * 2^(attempt - 1)` |

Regras da engine:

- `attempts < maxAttempts` → nova tentativa após `sleepBackoff`.
- Ao esgotar tentativas → stage `FAILED`, `stage.rollback`, job `error`,
  `WorkflowFailedError` lançado.
- **`RetryDependencyError`**: stage sinaliza que uma dependência precisa ser
  re-executada (ex.: quality não passou → refazer copywriter). A engine
  re-executa a dependência, comita o novo artefato, e retenta o stage.

## Rollback

Dois níveis:

1. **Rollback do stage** (`stage.rollback`): chamado quando o stage falha de
   forma terminal. Remove resíduos (ex.: deleta post programado / foto).
2. **Rollback do workflow** (`engine.rollback`): executa o `rollback` dos
   stages `COMMITTED` em **ordem reversa** e marca o job como `error`.

O padrão é: **stage deleta o que criou; o workflow restaura o estado confiável.**

## Recuperação (crash/restart)

Dois momentos:

1. **Boot do servidor**: `recoverInterruptedPlannerWorkflows()` chama
   `listRecoverable({ workflow, sinceMs })`, que retorna jobs `running`/`pending`
   mais antigos que `sinceMs` (evita retomar jobs que ainda podem estar rodando).
   Cada job é retomado com `engine.run(jobId, ctx, { resume: true })`.
2. **Falha durante processamento**: o próprio `run` em modo `resume` carrega o
   checkpoint, **pula stages `COMMITTED`** e retoma do primeiro não-commitado.

### Lock de concorrência

`findActiveByLockKey(lockKey, workflow)` impede que dois jobs ativos do mesmo
tenant rodem ao mesmo tempo. `startPlanGeneration` retorna **409 CONFLICT** se
já houver job `running`/`pending`.

## Erros

| Erro | Quando |
|------|--------|
| `WorkflowFailedError` | Falha terminal (retries esgotados) — carrega `jobId`, `stageId`, mensagem |
| `RetryDependencyError` | Stage pede re-execução de uma dependência antes de retentar |

## Arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `types.ts` | Tipos: `StageStatus`, `WorkflowStatus`, `ArtifactMap`, `RetryPolicy`, `StageEvent`, `StageTrace`, `WorkflowSnapshot` |
| `stageInterface.ts` | Contratos `StageInterface` / `WorkflowInterface` + definições declarativas |
| `retry.policy.ts` | `resolveRetryPolicy`, `nextRetryDelayMs`, `sleepBackoff`, `hasAttemptsRemaining` |
| `checkpoint-store.ts` | Interface `CheckpointStore` + `InMemoryCheckpointStore` |
| `postgres-checkpoint-store.ts` | Implementação Postgres (drizzle) |
| `workflow.engine.ts` | `WorkflowEngine`: `run`, `rollback`, `listRecoverable`, `WorkflowFailedError`, `RetryDependencyError` |
| `workflow-registry.ts` | Registro global `id → WorkflowDefinition` |
| `progress-reporter.ts` | Utilitários de progresso (`collectEvents`, `createProgressReporter`) |
| `index.ts` | Barrel exports |

## Testes

```bash
npx vitest run apps/api/src/__tests__/stateMachine/
```

Cobre: execução em ordem (deps), retry com backoff, rollback em ordem reversa,
lockKey, persistência InMemory e adapter de `JobStatus`.