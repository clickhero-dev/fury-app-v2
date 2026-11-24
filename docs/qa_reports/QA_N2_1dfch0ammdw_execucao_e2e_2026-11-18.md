# Execução E2E — Redis do worker Meta — 18/11/2026

Card: [N2] Corrigir conexão Redis do worker de sincronização Meta (`1dfch0ammdw`).
PR: https://github.com/clickhero-dev/fury-app-v2/pull/476
Head avaliado: `fc7b4cd954d6ceaec2ca0790998f5b04d21b4d56` (branch `codex/1dfch0ammdw-redis-atualizado`).

## Testes executados

- `RUN_REDIS_RECOVERY_E2E=1 npx vitest run apps/api/src/__tests__/meta-sync-redis-recovery.integration.test.ts`: 1 teste aprovado. Redis 7 e BullMQ reais; processa job, interrompe Redis por 15 segundos, recupera a conexão, processa job posterior e verifica deduplicação. O processador é sintético, sem API Meta ou banco.
- `npx vitest run apps/api/src/__tests__/redis-resilience.test.ts apps/api/src/__tests__/redis-startup-health.test.ts apps/api/src/__tests__/meta-sync-retry.test.ts apps/api/src/__tests__/meta-sync-startup-health.test.ts apps/api/src/__tests__/meta-sync-worker.test.ts`: 5 arquivos, 35 testes aprovados.

## Problema encontrado e correção

O check `Chatbot / real DB, E2E and image` do head falhou em `chat-real.spec.ts:100`: `getByLabel('Vídeo gerado')` encontrava quatro elementos (botão, vídeo e botões auxiliares) e acionava uma violação de strict mode. O mesmo seletor aparecia no cenário de edição de vídeo. Ambos foram restringidos ao elemento `video[aria-label="Vídeo gerado"]`, de modo que a asserção de `src` valida o elemento de mídia correto. A nova execução do check no head corrigido ainda precisa confirmar a correção.

## Estado de merge e limites

No head consultado, GitHub reporta `MERGEABLE` e base `hmg` `525894fc`; não há conflito textual ativo. `build-api`, `build-web`, `test-unit` e `jornada-real` passaram. O check do Chatbot falhou devido ao seletor descrito e precisa ser reexecutado. A PR permanece draft e `UNSTABLE`.

Não foi possível validar Redis, conectividade, configuração, política de reinício nem sincronização Meta real em HMG/produção por falta de acesso operacional. Portanto a validação de ponta a ponta em ambiente implantado continua pendente. O conector ClickUp retornou limite diário de chamadas; nenhum dado do card foi alterado. A árvore principal continha 223 alterações preexistentes; todo trabalho foi feito em worktree isolada para preservá-las.
