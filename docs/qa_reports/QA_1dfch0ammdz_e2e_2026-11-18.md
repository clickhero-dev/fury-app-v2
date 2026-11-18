# E2E — health de conexão do banco — 18/11/2026

Card: [Investigar falhas de conexão do banco no health check](https://app.clickup.com/t/1dfch0ammdz). PR validada: [#486](https://github.com/clickhero-dev/fury-app-v2/pull/486).

## Escopo e execução

A PR #486 estava marcada como `DIRTY` porque a base `hmg` havia avançado depois do head. Foi feito merge de `origin/hmg` no worktree isolado da PR. O único conflito ocorreu em `apps/web/e2e-mock/chat-real.spec.ts`: a branch usava `getByLabel` para localizar o vídeo, enquanto a base atualizada usa o seletor CSS do viewer atual. Mantivemos o seletor da base e a verificação de status da aprovação; nenhuma alteração foi feita no checkout principal.

Dependências instaladas no worktree e `@fury/shared`/`@fury/db` compilados. Rodadas as suítes `api-health-database`, `database-probe`, `startup-gate.e2e`, `api-docker-startup`, `db-health-chat-bootstrap.bdd`, `database-probe.postgres.e2e` e `database-startup-process.e2e`: **7 arquivos, 19 testes aprovados, sem skips**. A PostgreSQL 16 Alpine descartável confirmou o timeout/cancelamento de `pg_sleep(60)`, ausência da consulta pendente em `pg_stat_activity` e reutilização do pool. A suíte de processo confirmou health HTTP 200 com estado `critical` e categoria `unavailable`, seguido de saída 1. Container removido após o teste.

As suítes verificam classificação de falhas, sanitização, timeout, observabilidade e isolamento de telemetria, health acessível durante startup/falha, gate de rotas, bootstrap do chat, imagem Docker e encerramento do processo.

## Achados e resolução

- Um primeiro `npm ci` falhou porque `apps/web/node_modules` era um symlink do worktree apontando para outro checkout. O teste com dependências incompletas também falhou ao carregar `zod` e não observou o health no processo. Removemos apenas symlinks locais ignorados do worktree, instalamos dependências próprias com `npm ci --ignore-scripts` e compilamos os pacotes compartilhados; a execução completa então passou.
- Nenhum defeito de implementação foi reproduzido; não houve necessidade de mudar código de produção ou criar novos testes, pois as suítes existentes cobriram os casos E2E descritos.
- O conflito de integração foi resolvido e validado com `git diff --check` e ancestralidade da base.

## Limites e estado de merge

O teste local comprova os comportamentos da branch em PostgreSQL isolado. Não correlaciona retroativamente os seis incidentes de produção nem verifica configuração/deploy, dimensionamento do pool ou recuperação operacional de filas em HMG. Isso permanece registrado em `QA_1dfch0ammdz_db_health.md` e no plano em `docs/specs/1dfch0ammdz-db-health-followup.md`.

No head remoto anterior à resolução, os checks `Chatbot / real DB, E2E and image`, `build-api`, `build-web`, `jornada-real` e `test-unit` estavam verdes. A integração acima cria um novo head e exige que os checks sejam executados novamente. O status final do GitHub e dos checks pós-push deve ser consultado antes de declarar a PR pronta para merge.
