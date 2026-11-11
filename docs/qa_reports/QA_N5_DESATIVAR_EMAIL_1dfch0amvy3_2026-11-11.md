# QA — N5 Desativar envio de e-mail (`1dfch0amvy3`)

## Objetivo

Validar que alertas com o assunto `Falha na sincronização Meta` deixam de ser
enviados a `diogommtdes@gmail.com`, sem interromper o processamento do worker
nem os alertas para destinatários permitidos.

## Escopo e evidência

- PR: #423 (`fix/n5-desativar-email-meta`), commit-base `7e354566`.
- Fluxo validado: worker Meta -> `notifyMetaSyncFailure` -> seleção de
  destinatários -> adaptador `emailService.sendEmail`.
- Não há interface de usuário para esse alerta de background. A Vite disponível
  na porta 5174 pertence a outro worktree (`feat/1dfch0amjac-public-trial-signup-impl`),
  por isso não foi usada como evidência desta PR.

## Problemas encontrados e resolução

| Problema | Impacto | Resolução |
| --- | --- | --- |
| O endereço bloqueado podia ser reinserido por `SYNC_ALERT_EMAILS`. | Continuaria consumindo cota do Resend. | A implementação filtra o endereço após `trim`, sem diferenciar maiúsculas/minúsculas. |
| Um mesmo destinatário permitido repetido na configuração gerava vários envios. | Consumo desnecessário de cota e alertas duplicados. | Incluída deduplicação case-insensitive, preservando a primeira ocorrência e a ordem. |

## Testes executados

1. RED: cenário BDD de endereço permitido repetido falhou como esperado:
   `expected sendEmail to be called 1 times, but got 3 times`.
2. GREEN: `npx vitest run apps/api/src/__tests__/meta-sync-alerts.test.ts apps/api/src/__tests__/meta-sync-worker.test.ts apps/api/src/__tests__/adr-0003-meta-async-sync-v2.test.ts`
   - 3 arquivos, 32 testes aprovados.
3. `git diff --check` sem erros de whitespace.
4. Merge simulado com `origin/hmg` sem marcadores de conflito; a PR pode ser
   aplicada sem conflito de conteúdo.

## Cobertura de comportamento

- padrão não contém o destinatário bloqueado;
- variável de ambiente com o endereço bloqueado, espaços e caixa diferente não
  aciona o provedor;
- configuração contendo apenas o endereço bloqueado não reserva a chave de
  dedupe no Redis;
- destinatário permitido recebe exatamente um alerta;
- repetição do destinatário permitido gera exatamente um envio;
- dedupe por tenant/código, novo código de erro e recuperação após falha SMTP
  permanecem cobertos;
- o worker mantém o caminho de sucesso sem alerta.

## Limitação externa encontrada

`npm run build --workspace=@fury/api` continua falhando antes e fora do escopo
da PR por dependências/tipos ausentes no worktree (por exemplo `zod`, pacotes
`@bull-board/*` e exports do pacote `@fury/db`). Os testes isolados desta PR
executam normalmente e não apresentam erro de compilação no fluxo alterado.
