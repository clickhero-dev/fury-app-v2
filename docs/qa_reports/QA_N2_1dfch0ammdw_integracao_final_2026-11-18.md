# QA — Redis do worker Meta — integração com hmg

- Card 1dfch0ammdw: descrição consultada pelo cliente ClickUp existente após limite diário do conector. PR #476 sucede as alternativas #427 e #436; não integrar as três.
- Base `hmg` 525894fc integrada ao head f6fee790 sem conflitos textuais. Revisada a integração de `index.ts` e do workflow CI: preserva inicialização e encerramento observados e o teste Redis no CI.
- Cinco suítes focadas: 35 testes aprovados. Com `RUN_REDIS_RECOVERY_E2E=1`, teste de integração com Redis 7/BullMQ reais aprovado: consumo antes da interrupção, Redis indisponível por 15 s, recuperação, consumo e deduplicação. O processador é sintético, não executa Meta nem prova durabilidade ou exactly-once.
- No head anterior, CI monorepo passou; chatbot e jornada real falharam (seletores/prévia e cota de imagens QA). A base integrada contém alterações posteriores nesses testes; os checks do novo head precisam concluir antes de declarar a PR pronta.
- Ainda não há evidência de acesso operacional a HMG/produção: URL e topologia Redis, logs, reinício, conectividade e processamento Meta real após recuperação permanecem sem verificação. Não houve deploy nem alteração de configuração. A PR deve permanecer em rascunho até resolver essas pendências e os gates.
