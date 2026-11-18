# QA E2E — conexão Redis do worker Meta — 18/11/2026

Card: [1dfch0ammdw](https://app.clickup.com/t/1dfch0ammdw)

PR avaliada: [#488](https://github.com/clickhero-dev/fury-app-v2/pull/488)

Head avaliado: `cd65cf010059a23586fcfcf6331f32104c9fb755`

Base remota antes da reconciliação: `1cc22c51565211662beef0300bc830a2f43f4e49`.

## Escopo e resultado

Executado o E2E de recuperação com Redis 7 e BullMQ reais, além dos testes focados de resiliência, startup, retry e worker. O caminho cobriu consumo antes da queda, Redis indisponível por 15 segundos (além do limite de reconexões), recuperação, novo consumo e deduplicação. O processador é sintético: não chama API Meta nem valida persistência ou configuração implantada.

## Testes

Comando:

```sh
RUN_REDIS_RECOVERY_E2E=1 npx vitest run \
  apps/api/src/__tests__/redis-resilience.test.ts \
  apps/api/src/__tests__/redis-startup-health.test.ts \
  apps/api/src/__tests__/meta-sync-retry.test.ts \
  apps/api/src/__tests__/meta-sync-startup-health.test.ts \
  apps/api/src/__tests__/meta-sync-worker.test.ts \
  apps/api/src/__tests__/meta-sync-redis-recovery.integration.test.ts
```

Resultado: **6 arquivos, 36 testes aprovados**, incluindo a integração Redis/BullMQ.

Os checks remotos existentes no head antes desta reconciliação: CI monorepo e jornada real passaram; Chatbot falhou. O artefato do Chatbot indicou que o E2E real esperava HTTP 404 para uma aprovação expirada, mas a API respondeu 409. A `hmg` atual já contém a expectativa correta de 409. O mock E2E concluiu 96/96 testes. Após a integração, a suíte precisa rodar novamente no novo SHA.

## Conflito reconciliado

A PR estava `mergeable: false` porque `hmg` avançou após a base da branch, criando conflito em `apps/web/e2e-mock/chat-real.spec.ts`. O conflito nas asserções do vídeo foi resolvido mantendo os seletores por label acessível exato introduzidos pela PR; a expectativa de 409 vinda de `hmg` também foi preservada. Assim, não se perde a correção de seletor nem a atualização do contrato HTTP.

## Limites ainda abertos

- Não há acesso operacional comprovado nesta execução para consultar `REDIS_URL`, conectividade, topologia, logs ou política de restart em HMG/produção.
- Não foi executada sincronização Meta real após recuperação.
- A nova integração com `hmg` precisa de CI completo no SHA de merge; em particular, o E2E com banco real que falhou no head anterior.
- Não se demonstra exactly-once nem durabilidade em falha abrupta; deduplicação e retomada do consumidor foram exercitadas.

Nenhum deploy ou alteração de configuração de ambiente foi realizado.
