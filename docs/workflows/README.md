# Workflows (State Machine / Saga)

> Documentação da biblioteca de workflows do FURY e dos fluxos que a utilizam.
> A engine é genérica e reutilizável — novos workflows são adicionados apenas
> com uma definição declarativa, sem tocar na engine.

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [`workflow-engine.md`](./workflow-engine.md) | A biblioteca state machine: conceitos, engine, checkpoints, retry, rollback e recuperação |
| [`planner-generate.md`](./planner-generate.md) | Passo a passo do workflow de planejamento de conteúdo (IA) |

## Workflows registrados

| ID | Workflow | Definição | Estado |
|----|----------|-----------|--------|
| `planner-generate` | Planejamento de conteúdo mensal com IA | [`orchestrator.ts`](../../apps/api/src/agents/orchestrator.ts) | Em produção |

Para adicionar um novo workflow, siga o checklist abaixo.

---

## Como adicionar um novo workflow

A engine não conhece o domínio. Adicionar um fluxo novo (ex.: criação de
campanha, publicação de posts, geração de criativos) é declarativo:

### 1. Defina o input do workflow

```ts
export interface MinhaCampaignInput {
  tenantId: string;
  campaignId: string;
}
```

### 2. Defina os stages

Cada stage deve produzir um artefato (`artifactKey`) que é persistido como
checkpoint. Stages com `deps` só rodam após as dependências serem commitadas.

```ts
const stages: StageDefinition<MinhaCampaignInput, unknown>[] = [
  { id: 'validar', artifactKey: 'validado', execute: (ctx) => validar(ctx) },
  {
    id: 'criar',
    deps: ['validar'],
    artifactKey: 'metaIds',
    execute: (ctx, artifacts) => criarNaMeta(ctx, artifacts.validado),
    rollback: (ctx, artifacts) => deletarNaMeta(artifacts.metaIds),
  },
];
```

### 3. Monte a `WorkflowDefinition`

```ts
export const minhaCampaignWorkflow: WorkflowDefinition<MinhaCampaignInput> = {
  id: 'campaign-create',
  lockKey: (ctx) => ctx.tenantId,
  defaultRetry: { maxAttempts: 3, backoffMs: 1000, backoffType: 'exponential' },
  stages,
  // Opcional: deriva um ID de resultado persistido em workflow_jobs.plan_id
  finalize: (_ctx, artifacts) => ({ planId: artifacts.metaId as string | undefined }),
};
```

### 4. Registre e exponha no runner

Adicione o workflow ao [`workflow-registry`](../../apps/api/src/services/stateMachine/workflow-registry.ts)
(registro global) e crie/adapte um runner como
[`planner-workflow-runner.ts`](../../apps/api/src/planner-workflow-runner.ts):

```ts
import { registerWorkflow, WorkflowEngine } from './services/stateMachine/index.js';
import { minhaCampaignWorkflow } from './agents/minha-campaign.workflow.js';

registerWorkflow(minhaCampaignWorkflow);

export async function runMinhaCampaign(jobId: string, tenantId: string) {
  const engine = new WorkflowEngine(minhaCampaignWorkflow, meuCheckpointStore);
  await engine.run(jobId, { tenantId }, { resume: true });
}
```

### 5. Enfileire via worker (opcional)

Se o fluxo for assíncrono e demorado, use BullMQ como no
[`planner.worker.ts`](../../apps/api/src/workers/planner.worker.ts)
(fila com `concurrency`, `attempts` e `backoff` no nível da fila).

### 6. (Opcional) Recuperação no boot

Se o fluxo precisa ser retomado após crash/restart, chame
`recoverInterruptedPlannerWorkflows` no boot do servidor (veja
[`index.ts`](../../apps/api/src/index.ts)).

### Regras de ouro

- **`artifactKey` é obrigatório** — é o que garante o checkpoint recuperável.
- **Stage com efeito colateral deve ter `rollback`** que remova os resíduos.
- **`lockKey`** deve ser único por "unidade de concorrência" (ex.: tenant).
- Não dependa de estado global — a engine passa `ctx` e `artifacts` a cada stage.
- Rode os testes da engine antes de registrar um workflow novo:
  `npx vitest run apps/api/src/__tests__/stateMachine/`