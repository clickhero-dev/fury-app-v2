# ADR-0004: Execução e nomenclatura de jobs de background

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: Diogo Thomaz, Fury team

## Context

O Fury usa filas BullMQ para vários workers, mas também executa trabalho de negócio em timers e em uma lista Redis crua. O Bull Board monitora apenas um subconjunto das filas. Nomes como `generate`, `tick` e `run` não identificam com clareza o propósito do job quando aparecem em logs e ferramentas operacionais.

## Decision

1. Todo trabalho de negócio assíncrono, agendado, repetível ou que precise sobreviver a restart deve ser representado por um job BullMQ. Não criar filas de negócio com Redis Lists, `setInterval` ou cron externo.
2. Heartbeats de request/worker, keepalive de SSE, timeouts de rede, backoff local de uma operação em curso, flush de logs e watchdogs de processo são timers de infraestrutura, não jobs; não devem ser convertidos apenas para cumprir esta ADR.
3. Todo nome operacional de job segue o padrão legível:

   ```text
   <tipo>-<dominio>-<acao-e-objeto>
   ```

   - O prefixo é `cron` para uma ocorrência criada por recorrência agendada e `worker` para trabalho discreto enfileirado por evento ou por outro job.
   - Em seguida vêm domínio e ação/objeto específicos, em minúsculas ASCII e separados por hífen. O domínio pode conter mais de uma palavra quando isso torna o contexto claro.
   - O nome deve dizer o que será feito e sobre qual objeto, sem depender de payload ou de abrir o job. Exemplos: `cron-ady-billing-renewal-plans`, `cron-meta-sync-ad-account-data`, `worker-meta-onboarding-sync-assets`, `worker-studio-image-generate`.
   - Evitar nomes genéricos como `tick`, `run`, `sync` ou `generate` isolados, assim como nomes do scheduler sem prefixo de tipo.

4. O nome da fila é uma identidade técnica separada do nome operacional do job. Filas existentes não são renomeadas só para deixar o job mais legível. No Bull Board, o ID visível do scheduler também começa com `cron-` e identifica domínio, ação e frequência (por exemplo, `cron-meta-sync-ad-account-data-every-15m`).
   - No Bull Board, `BullMQAdapter` aceita um `prefix` visual e um `delimiter`. Usar `prefix: '<dominio>.'` e `delimiter: '.'` cria caminhos como `ady.billing-renewal` sem alterar `queue.name`; `uiConfig.overview.groupByDelimiter` define o agrupamento inicial. Cada fila também declara `displayName` e `description` para explicar sua função.
   - O alias do painel é apenas apresentação/roteamento do adapter. Mudanças no `queue.name` real continuam exigindo migração coordenada de jobs pendentes, workers e schedulers.
5. Agendamentos recorrentes usam `Queue.upsertJobScheduler` com IDs estáveis. Quando o ID mudar, remover somente os IDs antigos explicitamente mapeados antes do upsert. Inicialização imediata deve ser expressa por configuração idempotente ou jobId determinístico, sem enfileirar uma ocorrência adicional a cada réplica/restart.
6. Jobs usam `attempts` e `backoff` adequados ao domínio, com operações idempotentes ou deduplicação quando o retry possa repetir efeitos.
7. Ao renomear job, workers mantêm aliases dos nomes antigos durante a drenagem de jobs pendentes. Schedulers legados são removidos por chave/nome/ID exatos antes de criar os schedulers padronizados, para evitar ocorrências duplicadas.
8. Os dois fluxos Meta permanecem distintos: sincronização inicial de ativos após OAuth e sincronização periódica dos dados da conta de anúncios. A migração mantém o nome da fila periódica, payload, cron de 15 minutos, healthcheck de 12 horas e chaves de dedupe definidos em ADR-0003. O nome deve refletir o escopo real do pipeline, não sugerir que só uma entidade seja sincronizada.
9. O Bull Board é a interface operacional para as filas BullMQ: habilitar throughput, workers, schedulers, logs e ações de retry. Os workers usam nomes estáveis para aparecer na inspeção de consumidores. A repetição de jobs falhos e concluídos e a execução de schedulers são permitidas somente aos superadmins. A coleta histórica usa o pacote oficial `@bull-board/metrics` em Redis, com namespace próprio, retenção de 90 dias e métricas nativas habilitadas por uma semana nos workers. PostgreSQL não é usado para jobs nem para o histórico do dashboard.

## Consequences

### Positive

- Jobs de negócio ficam duráveis, observáveis e disponíveis no Bull Board.
- Logs e inspeção mostram tipo, domínio e ação sem depender de payload para identificar a tarefa.
- Recorrências BullMQ são idempotentes entre réplicas e reinícios.
- Operações de fila podem ser acompanhadas no painel com throughput atual/histórico e reexecutadas por superadmins.

### Negative

- A aplicação mantém workers e filas adicionais para tarefas que antes usavam timers/listas Redis.
- Jobs persistidos com nomes antigos precisam continuar compatíveis durante rollout/drenagem.
- Reexecutar um job concluído pode repetir efeitos externos; usar a ação somente quando a funcionalidade for segura para repetição.
- `job.name` e o ID do scheduler tornam a tarefa identificável; o overview do Bull Board continua organizado por fila.

## Migration notes

- Migrar Redis Lists com passagem compatível: mensagens pendentes devem chegar ao BullMQ com identificadores idempotentes antes de remover o consumidor/lista antigos.
- Migrar timers de negócio preservando frequência, primeiro disparo, isolamento de erro e desligamento gracioso.
- Não converter timers que apenas mantêm uma conexão/request ativo ou renovam um lease enquanto um worker executa.

## Related decisions

- [ADR-0001 — camada de repositório](0001-tenant-repository-layer.md)
- [ADR-0003 — sincronização assíncrona dos dados Meta](0003-meta-async-sync-v2.md)
