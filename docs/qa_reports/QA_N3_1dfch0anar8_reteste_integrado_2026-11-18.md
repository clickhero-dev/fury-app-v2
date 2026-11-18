# QA — TEMPLATE_ANALYSIS_INVALID — 18/11/2026

Card: https://app.clickup.com/t/1dfch0anar8. PR: https://github.com/clickhero-dev/fury-app-v2/pull/480. Base testada: 603f23273c1dbade138de86e718cfaa02b3084bb, com correções de teste neste commit. `hmg` era ancestral da branch; GitHub indicava MERGEABLE.

## Evidências

- Playwright Chromium browser → controller/service reais: 1 teste aprovado. Para schema inválido, verifica HTTP 502 seguro, cota reembolsada, nenhuma geração/persistência, preservação de dados e reenvio somente após ação manual. Provider, autenticação, cota e persistência usam fixtures: não é uma prova do deployment HMG.
- Vitest API: 98 testes em oito arquivos aprovados, abrangendo parser, provider, serviço, controller, telemetria, ambiente e erro. Interface EstudioHome: 35 testes aprovados.
- A jornada HMG no CI 44284230241 parou antes de gerar imagem: conta QA com 0/20 de cota. Campanha criada foi pausada e removida. A API HMG não era o backend do SHA da PR. Não foram alterados quota nem deployment; APP_ENV remoto permanece não verificado.
- CI 44284230284: chatbot falhou em seletor de vídeo que correspondia a quatro elementos. Seletores de criação e edição foram restringidos ao nome exato. No reteste, a execução avançou e revelou expectativa 404 incompatível com o contrato de rejeição 409 para moeda não confirmada; teste atualizado para 409 e para verificar que o registro não foi executado. O prazo global do cenário foi ampliado de 90 a 180 segundos após timeout local perto do fim.
- Execução local do gate exigiu pnpm sem verificação automática de dependências, por links de node_modules externos ao checkout; também usou ambiente Python existente e banco/serviços descartáveis. Porta 5175 ocupada impediu uma tentativa do gate completo. O reteste focalizado com PostgreSQL e serviços isolados passou (1 teste, 1,3 minuto); omite a etapa mock, que não foi revalidada nessa execução.

## Limitações

As fixtures sintéticas não identificam a resposta dos cinco eventos históricos, nem comprovam integração com provedor real. A condição dos checks remotos deve ser conferida no SHA final. A jornada HMG exige cota e, para exercitar este backend, ambiente que execute o SHA da PR.
