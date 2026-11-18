# QA — login demo HMG — 18/11/2026

Card: https://app.clickup.com/t/1dfch0anarb. PR: https://github.com/clickhero-dev/fury-app-v2/pull/464. Base: 25a28408afb907fa193748e3424b91c3141393b6; head inicial: fc660d89cc239eb247148ab2590c71f9e0d85891.

## Resultados

- API, seed e telemetria: 11 testes Vitest passaram. Interface: 3 testes passaram, incluindo falhas e tentativa manual.
- Migração: 2 testes passaram em PostgreSQL 16 descartável, verificando idempotência e preservação de tenants comerciais, mistos, vazios e excluídos.
- Playwright Chromium com API simulada: 503 não cria sessão, não repete automaticamente e permite entrada na segunda tentativa manual (1 teste passou). Isso não valida a API real.
- Sondagem direta da API HMG: HTTP 503, DEMO_UNAVAILABLE. A causa histórica e a correção implantada não foram confirmadas.
- GitHub: base HMG era ancestral do head e PR estava mergeável. Builds e testes unitários do CI estavam verdes; jornada real falhou por cota de imagens QA esgotada (20/20), após login normal, criação, pausa e limpeza de campanha: https://github.com/clickhero-dev/fury-app-v2/actions/runs/44260600949.
- Artefato da terceira tentativa do gate Chatbot registrou 89 testes aprovados e 7 falhas: duas esperavam botão substituído pela pré-visualização automática; cinco usavam seletor de vídeo ambíguo. Run: https://github.com/clickhero-dev/fury-app-v2/actions/runs/44260600896.

## Correções e limitações

Os testes de mídia agora verificam o carregamento automático e os testes de vídeo usam rótulo exato. Após clicar no vídeo, o teste verifica e fecha a visualização antes de interagir com a conversa. Os 7 cenários originalmente falhos passaram localmente em Chromium. Não foram alteradas regras de produto ou dados HMG. Uma primeira repetição local teve colisão de porta e outra teve colisão de diretório de artefatos entre processos; a execução isolada subsequente passou.

A PR ainda depende dos checks do novo head e da restauração da cota da conta QA para repetir a jornada real. A hipótese do tenant legado sem is_demo é reproduzível, mas não comprova o estado do banco no evento. Após disponibilização da correção em HMG, validar login real e saúde/configuração do tenant, Redis e APP_ENV. O MCP do ClickUp atingiu limite diário; descrição consultada via cliente existente. MCP de grafo indisponível; implementação e testes foram lidos diretamente.

## Revalidação após avanço da base HMG

A base `525894fc` foi integrada. Os conflitos em `chat.spec.ts` e `chat-redesign.spec.ts` foram resolvidos preservando seletores de vídeo e asserção do visualizador da base. A expectativa de confirmação de proposta legada sem moeda no E2E integrado foi corrigida de 404 para 409: o serviço identifica a proposta existente, mas rejeita o estado inválido. O teste também verifica que ela continua pendente e sem resultado. A falha anterior foi observada no workflow Chatbot 44335522251.

Testes nesta integração: 15 testes API/seed/telemetria e interface passaram; 7 testes web com configuração jsdom passaram; 2 testes de migração passaram em PostgreSQL 16 descartável, com migração dupla; Playwright de login com API simulada passou em desktop e celular. Uma primeira execução indevida do teste web com configuração Node falhou por ausência de localStorage; a repetição na configuração web passou. Uma tentativa local do gate encontrou a porta 5175 ocupada; os testes foram transferidos para portas isoladas. Uma execução ampla do Chatbot local apresentou dois timeouts esperando o diálogo de cookies e foi interrompida; não se atribui uma causa conclusiva a eles. Consultar os checks da PR no SHA final para resultado integrado.

A sondagem atual de HMG retornou HTTP 503 `DEMO_UNAVAILABLE`; não foi feito deploy nem verificado o estado histórico do banco. A base alterou a jornada automática de PR para navegação sem mutações; a jornada com geração de imagem exige execução manual e continua distinta dessa verificação. Os resultados de checks e do E2E com serviços reais devem ser conferidos antes da aprovação.
