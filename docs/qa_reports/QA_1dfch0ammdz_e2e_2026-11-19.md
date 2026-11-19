# E2E — health de conexão do banco — 19/11/2026

Card [1dfch0ammdz](https://app.clickup.com/t/1dfch0ammdz), PR [#481](https://github.com/clickhero-dev/fury-app-v2/pull/481). Validação em worktree isolado `/tmp/fury-dbhealth-e2e`; checkout principal preservado.

## Resumo da execução

- A consulta ClickUp falhou porque a integração excedeu o limite diário de 100 chamadas. O escopo foi conferido pelo título e pela PR #481 vinculada ao card.
- Antes da reconciliação, o GitHub informava `mergeable: false`, `mergeable_state: dirty`. `git merge-tree origin/hmg origin/codex/1dfch0ammdz-db-health-followup` reproduziu três conflitos: `apps/web/e2e-mock/chat-media.spec.ts`, `chat-real.spec.ts` e `chat-redesign.spec.ts`.
- Os conflitos eram nos E2Es de mídia/vídeo e aprovação do chatbot, trazidos pelas atualizações recentes de `hmg`. A resolução preservou os seletores exatos e verificações de `src`/estado pendente da PR e incorporou asserções atuais de visualizador, imagem carregada, controles de vídeo e fechamento do diálogo da base.
- Integrei `hmg` (base `4b684f24`) à branch da PR e publiquei o merge commit `2acb3f6515d93d108b7210d54f9336ac274c68fd`. Após a publicação, a PR passou a `mergeable: true`, `mergeable_state: clean`; não restaram conflitos.
- Instalei dependências com `npm ci --ignore-scripts --no-audit --no-fund` neste worktree e compilei `@fury/shared` e `@fury/db`.
- Rodei sete suítes focadas do health com PostgreSQL 16 Alpine descartável: `api-health-database`, `database-probe`, `database-probe.postgres.e2e`, `database-startup-process.e2e`, `startup-gate.e2e`, `db-health-chat-bootstrap.bdd` e `api-docker-startup`. Resultado: **7 arquivos e 19 testes aprovados**. O teste PostgreSQL confirmou timeout/cancelamento de `pg_sleep(60)` e reutilização do pool; o teste de processo verificou health crítico acessível e saída 1 com banco indisponível. O container foi encerrado ao final.
- `git diff --check` passou antes do merge commit. Nenhuma alteração de produção foi necessária.

## Estado e limitações

O SHA integrado ficou `clean` e sem conflitos no GitHub. Na primeira consulta imediatamente após o push, ainda não havia check-runs registrados para o novo SHA; validar a conclusão do CI antes de considerar a PR pronta para merge.

Esta execução valida o comportamento local da implementação. Não comprova a correlação dos seis eventos históricos com logs, o `APP_ENV` real, o dimensionamento do pool contra capacidade/réplicas de produção, nem o restart e a recuperação de jobs em HMG. Não havia acesso às fontes de observabilidade/infraestrutura e a integração ClickUp estava limitada. A jornada real de HMG da tentativa anterior também falhou por cota de imagens esgotada; esta suíte local não substitui a reexecução dessa jornada. Não declarar o card integralmente concluído nem a PR pronta para merge até resolver essas evidências operacionais e conferir checks verdes no SHA final.

## Caminho seguido

Isolamento em worktree para proteger as alterações locais preexistentes → atualização das refs → reprodução dos conflitos com `merge-tree` → resolução manual preservando asserções de ambos os lados → build shared/db → E2E focado com PostgreSQL descartável → publicação do merge commit → documentação deste resultado e pendências.
