# QA — conexão Redis do worker Meta — 18/11/2026

- PR #476, head original `2b8c3afe`; base `hmg` atualizada para `25a28408` e integrada sem conflitos textuais. As PRs #427 e #436 são alternativas anteriores, não devem ser integradas junto com esta.
- Cinco arquivos de testes focados passaram: 34 testes, incluindo configuração, inicialização, falhas, retry e health.
- O teste de integração `RUN_REDIS_RECOVERY_E2E=1 npx vitest run apps/api/src/__tests__/meta-sync-redis-recovery.integration.test.ts` passou com Redis 7 e BullMQ reais: processamento antes da interrupção, 15 segundos indisponível, retomada e deduplicação. Usa processador sintético; não comprova a sincronização Meta real ou durabilidade em produção.
- No CI do head original, builds API/web e testes unitários passaram. A jornada real falhou por cota de imagens esgotada (20/20); a campanha de teste foi removida. Esse teste usa a API HMG implantada, não o backend da branch.
- O gate do chatbot falhou em `chat-plan-worker.integration.test.ts`: o teste de reinício esperava `failed` e recebeu `completed`. A base atual contém alterações nesse teste; é necessário conferir o CI do novo head antes de concluir que foi resolvido.
- O ClickUp retornou limite diário; critérios consultados na descrição da PR. O cliente alternativo indicado não existe neste checkout.
- Sem acesso comprovado à configuração e aos processos de HMG/produção, não foram verificados URL e topologia Redis, logs, reinício e processamento Meta real após recuperação. Não houve deploy. Health reporta startup, não saúde contínua; deduplicação não garante exactly-once.
