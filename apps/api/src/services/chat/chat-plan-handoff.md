# Frente D — handoff de integração

## Estado verificado

Implementação backend completa dentro do ownership: somente novos módulos `chat-plan*`, seus testes e `0071_chat_plans.sql`. Não houve alteração de DI/router/bootstrap/migrate/lockfiles existentes, apps/chat, web, billing ou banco existente. Sem commit/push. Validação final: **82 testes passaram, 0 falharam, 0 ignorados**, em sete suítes, incluindo Postgres e BullMQ/Redis reais descartáveis; `tsc --noEmit` e ESLint das fontes passaram.

Graph consultado, mas sua build pertence a outra branch/commit e os resultados não correspondem aos módulos novos. Fonte, testes e execução prevaleceram; parent ainda deve fazer revisão independente e E2E integrado.

## Exportações exatas e wiring do parent

### DI

`services/chat/chat-plan-runtime.ts` exporta:
- `createChatPlanRuntime({baseUrl, secret, queue})` → `{service, controller, executor}`.
- `ChatPlanAccess`, `ChatPlanApiReader`, `chatPlanResources`, `PlanApiOptions`.

`baseUrl` é a origem interna **da API Node**, não a URL do Python nem entrada do usuário. `secret` deve ser o mesmo `CHAT_DELEGATION_SECRET` já utilizado pelo proxy/guard. Não há nova dependência npm.

```ts
import { createChatPlanRuntime } from './services/chat/chat-plan-runtime.js';
import { getChatPlanQueue } from './workers/chat-plan.worker.js';

// INTERNAL_NODE_API_ORIGIN é configuração confiável escolhida pelo parent.
export const chatPlanRuntime = createChatPlanRuntime({
  baseUrl: INTERNAL_NODE_API_ORIGIN,
  secret: process.env.CHAT_DELEGATION_SECRET ?? '',
  queue: {
    enqueue: async (wake, delayMs) => (await getChatPlanQueue()).enqueue(wake, delayMs),
  },
});
// Incluir chatPlan: chatPlanRuntime.controller no objeto controllers existente.
```

As classes também podem ser compostas diretamente: `ChatPlanService(repoFactory, queuePort, access)`, `ChatPlanController(service)`, `ChatPlanExecutor(repoFactory, capabilities, access, queuePort)` e `ChatPlanCapabilities(deps)`. A factory padrão já usa services/repositories reais. `ChatPlanRepository(tenantId,userId,database?)` é scoped; `ChatPlanRecoveryRepository(database?)` só enumera IDs globalmente.

### Router

`routes/chat-plan.routes.ts` exporta `createChatPlanRouter(controller,{delegationSecret})`.

No `routes/index.ts`, montar **ANTES de `router.use(chatDelegationGuard)`**, portanto também antes do proxy `/chat`. As rotas específicas fazem autenticação própria, distinguem humano/chatbot em WeakMap e revalidam identidade/acesso no service; não são rotas abertas nem dependem de headers de ator fornecidos pelo cliente.

```ts
router.use('/chat', createChatPlanRouter(controllers.chatPlan, {
  delegationSecret: process.env.CHAT_DELEGATION_SECRET ?? '',
}));
```

Prefixo completo após montagem: `/api/chat/conversations/:conversationId/plans`. Contratos de resposta, version/CAS e ações seguem `.hermes/plans/2026-11-10-chat-plans-contract.md`.

### Bootstrap/registry/observabilidade

`workers/chat-plan.worker.ts` exporta:
- `ChatPlanQueue(connection,{prefix?})`; `.queue` expõe a Queue BullMQ para registry/Bull Board.
- `getChatPlanQueue(): Promise<ChatPlanQueue>` e `closeChatPlanQueue(): Promise<void>` (singleton lazy).
- `createChatPlanWorker(connection, executor, queue, recoveryRepo,{prefix?})` → Worker.
- `CHAT_PLAN_QUEUE_NAME = 'chat-plan-execution'`.
- `CHAT_PLAN_EXECUTE_JOB = 'worker-chat-plan-execute-step'`.
- `CHAT_PLAN_RECONCILE_JOB = 'worker-chat-plan-reconcile-step'`.
- `CHAT_PLAN_RECOVERY_JOB = 'cron-chat-plan-recover-executions'`.
- `CHAT_PLAN_RECOVERY_SCHEDULER = 'cron-chat-plan-recover-executions-every-minute'`.

```ts
const queue = await getChatPlanQueue();
const recovery = new ChatPlanRecoveryRepository();
const worker = createChatPlanWorker(
  await getRedisConnection(), chatPlanRuntime.executor, queue, recovery,
);
await worker.waitUntilReady();
await queue.scheduleRecovery(); // upsert idempotente; não usar setInterval
await queue.recover(recovery);  // retomada imediata DB→Redis após boot
// Registrar queue.queue no registry/board/monitor existente.
// Shutdown: await worker.close(); await closeChatPlanQueue();
```

Iniciar o worker quando a API interna estiver pronta para atender GETs. Não criar outra instância singleton da mesma fila no registry. Os jobs guardam somente tenantId/userId/conversationId/planId/version (recovery paginado: afterId), nunca JWT. Workers têm métricas BullMQ de uma semana, concorrência 4 entre planos, uma etapa por plano por fence/lease, retenção de até 1000 jobs concluídos/falhos e duas tentativas da fila. Orçamento de tentativas da etapa limita chamadas seguras a duas; chamadas incertas não se repetem.

### Migration

Adicionar `{ tag: '0071_chat_plans' }` ao registro existente em `packages/db/src/migrate.ts`, depois da 0070 reservada à mídia. A migration foi aplicada apenas a schemas descartáveis de teste. **Não foi aplicada no banco local existente nem em produção.** Não é necessário alterar o schema Drizzle para este repository, que usa SQL parametrizado.

### UI/approvals

Quando uma tarefa apresentar `approvalId`, atualizar a lista de approvals existente da conversa e renderizar seu gate humano normal. Aprovar o plano NÃO aprova as propostas. O executor cria `chat_approvals` + vínculo com a tarefa na mesma transação e nunca chama POST de criação de imagem/vídeo/post/campanha. Confirmar a proposta continua passando pelo fluxo Python/Node existente e pelo consumo único da approval.

`read_*` retorna dados reais filtrados; `draft_text` chama OpenRouter real com `runWithTenant`, timeout e sem ferramentas arbitrárias. Mídia só conclui após resource final tenant-scoped; vídeo exige job `done` e asset válido. Post distingue agendado de publicado. Campaign exige registro com Meta ID. Resultado incerto não é sucesso nem autoriza nova ação.

Cancelar revoga approvals pending/approved; executing não é falsamente abortado. Pausa/cancelamento impedem próxima etapa mas permitem reconciliar efeito já iniciado. Espera manual não faz polling eterno; approvals têm prazo limitado, sem chamadas de LLM durante espera. Retomada humana de unknown com approval apenas reabre uma janela de reconciliação, sem reenviar ação.

## Compatibilidade com #420 / frente G

Preflight `StudioVideoService.getOptions(tenantId)` ocorre antes da approval: benefício ausente ou cota zero produz falha legível, sem approval/job/provider. Sem alteração de plano/quota. Também reconhece `chat_approvals.result.code` para `VIDEO_NOT_IN_PLAN`, `VIDEO_QUOTA_EXCEEDED`, `MODIFICATION_QUOTA_EXCEEDED`, `SERVICE_BLOCKED`; mensagens vêm de allowlist, nunca de payload arbitrário. Approval approved não consulta job inexistente; executing tem janela curta para a inserção do job antes de considerar ausência unknown.

## Reproduzir testes isolados

Containers descartáveis criados por D ainda disponíveis para integração do parent:
- `fury-chat-plan-d-postgres`: `127.0.0.1:32782`, database `chat_plans_isolated`, role postgres, autenticação trust local ao container.
- `fury-chat-plan-d-redis`: `127.0.0.1:32783`.

```sh
CHAT_PLAN_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32782/chat_plans_isolated \
CHAT_PLAN_TEST_REDIS_URL=redis://127.0.0.1:32783 \
pnpm --filter @fury/api exec vitest run \
 src/__tests__/chat-plan-domain.bdd.test.ts \
 src/__tests__/chat-plan.bdd.test.ts \
 src/__tests__/chat-plan.repository.postgres.test.ts \
 src/__tests__/chat-plan-executor.test.ts \
 src/__tests__/chat-plan-capabilities.test.ts \
 src/__tests__/chat-plan-runtime.test.ts \
 src/__tests__/chat-plan-worker.integration.test.ts --silent
pnpm --filter @fury/api exec tsc --noEmit
pnpm --filter @fury/api exec eslint src/services/chat/chat-plan*ts src/repository/chat-plan.repository.ts src/controllers/chat-plan.controller.ts src/routes/chat-plan.routes.ts src/workers/chat-plan.worker.ts
```

As suítes criam/removem schema aleatório e prefixo BullMQ exclusivo, usam dados sintéticos e não chamam provedores. Os testes reais de fila incluem dois workers e dois job IDs concorrentes, além de enqueue duplicado/dedup, recovery e restart após efeito incerto. Relatório final de testes: `/home/diogo/.hermes/cache/scratch/chat-plan-D-tests.json`.

Após integração, parent pode remover somente os recursos descartáveis próprios: `docker rm -f fury-chat-plan-d-postgres fury-chat-plan-d-redis`.

## Limites de aceite

Backend D está exercitado; wiring global, registro/aplicação da migration, montagem real com Python/web, registro da fila e E2E de navegador pertencem ao parent e **ainda não estão verificados aqui**. Nenhum efeito externo real foi executado. Parâmetros são fechados no draft; o contrato não define substituição dinâmica de URLs de etapas futuras. Para dependências que ainda não têm parâmetros concretos, usar tarefa manual e novo plano revisado, sem inventar IDs/URLs.

Autoavaliação (média 4,0/5): correção 4/5 (82 testes e tipos/lint, sem sandbox externo); completude 4/5 (escopo D completo, integração parent pendente por ownership); clareza 4/5 (exports e limitações documentados); acionabilidade 4/5 (wiring e comandos exatos, ainda exigem integração); concisão 4/5 (detalhes ficam neste handoff). Melhorias prioritárias: revisão independente pelo parent; E2E sintético com o fluxo de aprovação integrado. A verificação não autoriza publicar nem consumir créditos reais.
