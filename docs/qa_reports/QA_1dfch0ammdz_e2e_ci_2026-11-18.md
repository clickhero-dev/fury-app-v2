# QA E2E e CI — 1dfch0ammdz — 18/11/2026

Head inicial `f78f624e7d2bde31124b5112ddce708d781eb82b`, PR #475 para `hmg` `25a28408afb907fa193748e3424b91c3141393b6`. A base era ancestral do head e o GitHub informou `MERGEABLE`; nenhum conflito textual exigiu resolução.

## Execução e correções

- Seis suítes de health, probe, gate, Docker e processo: 18 testes passaram, incluindo PostgreSQL 16 descartável, cancelamento de `pg_sleep(60)`, reutilização do pool, health crítico via HTTP e saída 1 com banco indisponível. A suíte adicional do worker, inicialmente ignorada por falta de Redis, passou separadamente com Redis 7 descartável (1 teste). Os containers foram removidos.
- O check Chatbot da tentativa 2 falhou na fase Playwright, não no teste de recuperação do worker mencionado na descrição anterior. O artefato `chatbot-evidence-2` registrou sete falhas: dois timeouts do botão antigo de pré-visualização e cinco seletores de vídeo ambíguos. Reproduziu-se localmente o timeout antes da correção.
- A base passou a carregar imagens automaticamente e a renderizar o vídeo dentro de um visualizador com botões cujo nome contém o mesmo texto. Os testes foram atualizados para verificar imagem carregada e abertura/fechamento do visualizador, selecionar o elemento `video` explicitamente e verificar a abertura do diálogo nos três tamanhos de tela. As três suítes afetadas passaram: 45 testes Chromium. Nenhum código de produção foi alterado.
- A jornada real falhou com cota de imagens de HMG esgotada (20/20). Login, criação, pausa e limpeza da campanha ocorreram; não foi repetida sem restauração da cota. Ela usa backend remoto e não comprova o backend desta branch.

## Limitações

O conector ClickUp atingiu o limite diário; a descrição do card foi lida pelo cliente alternativo. Ainda faltam IDs e timestamps dos seis eventos e logs correlacionáveis, configuração efetiva de `APP_ENV`, capacidade e número de réplicas, e validação controlada de health, restart e recuperação de jobs em HMG. Não há evidência para concluir esses critérios. A PR permanece em rascunho; os checks devem ser conferidos no novo SHA e a jornada reexecutada após restabelecer a cota. A PR #427 continua exigindo reconciliação caso seja integrada primeiro.
