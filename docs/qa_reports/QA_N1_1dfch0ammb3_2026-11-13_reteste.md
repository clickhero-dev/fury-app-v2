# Reteste QA — Foto do estúdio estranha — 13/11/2026

Card: https://app.clickup.com/t/1dfch0ammb3. PR: https://github.com/clickhero-dev/fury-app-v2/pull/434. Código testado: `8393b52646399b95d694a498cbcf48310c61dbc5`.

## Resultado: incompleto

- `pnpm exec playwright test -c playwright.studio.config.ts` em `apps/web`: 2 testes passaram, cobrindo envio das fotos e escolha de texto com aprimoramento e com fallback. As APIs são simuladas: o teste verifica payload, não geração, upload, isolamento de tenant, storage ou fidelidade visual. O console registrou consultas sem respostas simuladas e falha de carregamento da imagem simulada.
- `pnpm exec vitest run apps/api/src/__tests__/studio-ai.service.test.ts apps/api/src/__tests__/studio-ai.controller.test.ts apps/web/src/pages/estudio/quick-create-text.test.ts`: 52 testes passaram em 3 arquivos.
- GitHub no head testado: PR #434 em rascunho, MERGEABLE/CLEAN, seis checks concluídos com sucesso. `origin/hmg` era ancestral do head após fetch. A PR #431 já estava fechada.
- O relatório histórico de 11/11 foi anotado para esclarecer que sua afirmação de ausência de geração se referia àquela avaliação. Uma execução posterior com provedor foi documentada na PR; ela usou repositório e cota simulados e não representa o request original.

## Pendências e limitações

Não foram executadas nesta rodada as três repetições com provedor e comparação visual humana previstas na especificação; tampouco foi exercitada a integração real de upload, banco, tenant e storage. Não havia credenciais de provedor, banco ou storage no ambiente do processo examinado, nem ambiente de teste isolado identificado. O teste simulado não demonstra identidade consistente nem legibilidade, e o request original não foi recuperado. Não há evidência suficiente para aprovar o critério principal, determinar causa raiz ou retirar o rascunho. Seguir o plano em `docs/specs/n1-foto-estudio-continuacao.md`, preservando todas as saídas e falhas, usando tenants, storage e cota de teste, e revalidar CI e merge no SHA final.
