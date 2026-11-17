# [N5] Avaliação do criativo após geração — correção do envio

Ticket: https://app.clickup.com/t/1dfch0amj6h
Base: hmg. A PR original #408 foi incorporada; não havia PR aberta relacionada no início desta correção.

## Diagnóstico

O arquivo `0059_creative_asset_ratings.sql` existe, porém não constava em `STEPS` no executor `packages/db/src/migrate.ts`. O boot não executava sua DDL e `REQUIRED_TABLES` também não verificava a tabela. Em um banco criado pelo executor, o primeiro envio encontraria uma relação inexistente. O defeito foi reproduzido pelo teste do executor, sem acesso ou alteração do banco de homologação.

## Especificação e plano executado

1. Preservar WIP e partir de origin/hmg em worktree isolada.
2. RED: testar o executor real com transporte PostgreSQL simulado, verificando registro/execução da migration, idempotência, falha da DDL e schema incompleto. Antes da correção: três falhas e um sucesso.
3. Registrar a migration existente, sem modificar sua DDL nem criar outra tabela. Exigir `creative_asset_ratings` na validação de boot. Sem alteração do contrato HTTP, UI ou escopo tenant do repository.
4. Migrar apenas PostgreSQL local isolado. Verificar envio HTTP pelo controller/service/repository reais, com autenticação e middleware de tenant reais: imagem/vídeo, upsert, concorrência, notas inválidas, UUID inválido, 401, 403 e 404; remover somente fixtures próprias.
5. Habilitar a integração de persistência no CI que já fornece PostgreSQL migrado. Verificar builds, testes do Estúdio, diff e CI remoto; abrir PR para hmg sem merge/deploy.

## Aceite

- Boot executa e registra a migration pendente uma vez; execução subsequente não repete DDL.
- Falha na migration impede sucesso e não registra aplicação; tabela ausente reprova validação.
- PUT autenticado de imagem/vídeo retorna 200 e persiste tenant/usuário/asset/nota corretos.
- Nova nota preserva createdAt e uma única linha; chamadas concorrentes também mantêm unicidade.
- Entrada inválida, ausência de autenticação, usuário fora do tenant e asset inexistente são rejeitados sem inserir.
- CI da PR verde, base hmg atualizada e sem conflitos antes da entrega.

## Evidências locais

- Executor antes da correção: 3 testes falharam pelo registro ausente e validação permissiva.
- Migration completa executada com sucesso em PostgreSQL 16 isolado (porta 32816), sem usar banco compartilhado.
- API: 22 testes focados passaram, incluindo 4 testes HTTP com PostgreSQL real e 4 testes do executor.
- Build shared/db e API verificados; resultados finais e CI registrados na PR.

Não houve deploy, merge ou intervenção no banco de homologação. A tabela será criada pelo executor normal da API quando a correção for implantada. Não se afirma reteste do ambiente de homologação nem E2E de navegador nesta correção de boot; a persistência foi validada por HTTP com banco real.

## Reteste independente — 16/11/2026

No SHA `97f2a1346e662bdbda0b7263c7a05d582f56e9c6`, a base `origin/hmg` estava contida na branch e o GitHub indicava MERGEABLE, mas UNSTABLE: `jornada-real` falhou antes da geração porque a conta de QA consumiu 20/20 imagens. Os demais checks estavam aprovados. Não foi alterada a cota nem executada uma nova jornada que criaria recursos externos.

- PostgreSQL 16 isolado: executor aplicou `0059_creative_asset_ratings`; quatro testes HTTP reais passaram (imagem, vídeo, atualização, concorrência e rejeições). Três arquivos adicionais de testes de migration, controller e service passaram (18 testes). A primeira tentativa de integração apontou para a porta padrão por falta de `TEST_DATABASE_URL`; a repetição com a URL isolada passou.
- Playwright Chromium: cenário de imagem, convite, seleção, falha de envio e nova tentativa passou (1/1). Geração e endpoint de avaliação foram simulados; não demonstra persistência pelo navegador nem geração real de vídeo. A primeira inicialização exigiu segredos locais de teste; com pnpm 12 o comando do webServer não encaminhou a porta esperada, resolvido iniciando Vite manualmente na porta configurada. Avisos de Redis, fontes e requisições não simuladas com token inválido não impediram o cenário.
- A integração HTTP e o teste de navegador são evidências complementares, não um E2E integral de navegador até PostgreSQL. Reteste em homologação depende do deploy da correção e de conta com cota. Portanto não é possível afirmar que todos os fluxos estão validados ou que o CI está verde.
