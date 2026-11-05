# ADR-0001: Camada de repository — repositórios por domínio sobre base tenant-scoped

**Date**: 2026-08-27
**Status**: accepted
**Deciders**: Diogo Thomaz, Hermes Agent

## Context

Todas as chamadas ao banco (via Drizzle ORM) estavam espalhadas por `apps/api/src/*` —
controllers, routes, services, workers, middleware, providers e scripts — totalizando
**~300 operações**, **~40 tabelas**, ~10 domínios, contra um singleton `db` exportado por
`@fury/db`. Isso acopla cada camada diretamente ao SQL/ORM, dificulta teste, reuso e evolução.

A intenção inicial era centralizar **tudo** numa única classe `TenantRepository(tenantId, db)`.
Após mapear o volume real, uma classe monolítica de ~300 métodos se mostrou inviável como
ponto de partida sustentável.

## Decision

Adotamos uma **camada de repositórios por domínio**, cada um scoped por tenant, sobre uma
base comum:

- **`TenantScopedRepository`** (abstract) — construtor `(tenantId, db = db)`. Preserva a
  intenção original (construtor já carrega `tenantId` e `db`). Hospeda as **lookups
  reutilizadas por vários domínios**: `findBrandKit`, `findClientGoal`/`findClientGoals`,
  `findMetaConnection`, `findBusinessProfile`, `findTenant`.
- **~12 repositórios por agregado de domínio**, herdando a base: `PlannerRepository`,
  `StudioRepository`, `CampaignRepository`, `MetaRepository`, `GoogleRepository`,
  `SubscriptionRepository`, `FuryEngineRepository`, `AutomationRepository`,
  `AuthRepository`, `FormsRepository`, `WorkflowJobRepository` (GLOBAL),
  `SuperAdminRepository` (GLOBAL).
- Critérios de agrupamento: **agregado raiz (DDD)**, **frequência de uso compartilhado**
  (lookups na base), **carga/volume** (infra apartada) e **escopo** (queries GLOBAL fora
  do padrão tenant-scoped).
- **Reuso por composição**: services recebem por injeção de construtor os repos que
  precisam. Consultas cross-domain vivem na base, não duplicadas.
- **Workers em lote multi-tenant** (`publish-due`, `rule-engine`, `fury-engine`,
  `google-sync`): usam `listTenants()` (GLOBAL) e instanciam o repo tenant-scoped por
  iteração — em vez de forçar um repo global.
- Migração em **ondas por domínio**, cada onda com testes verdes (exigência TDD do
  AGENTS.md), começando pela base.

## Alternatives Considered

### Alternative 1: `TenantRepository` monolítico único
- **Pros**: centraliza literalmente tudo; simplicidade mental de "uma classe".
- **Cons**: ~300 métodos (god-object); dif\u00edcil testar, revisar e evoluir; viola SRP.
- **Why not**: a análise do mapeamento mostrou escala que torna insustentável no momento.

### Alternative 2: Repositórios por tabela (máxima granularidade)
- **Pros**: granularidade máxima; cada classe pequena.
- **Cons**: ~40 classes com pouco ou nenhum reuso; fragmenta responsabilidades que
  pertencem ao mesmo agregado; infla o número de dependências.
- **Why not**: granularidade por agregado (não por tabela) entrega coesão melhor com
  menos classes e mais reuso.

## Consequences

### Positive
- Isolamento da camada de persistência (hexagonal, conforme AGENTS.md).
- Reuso real das lookups compartilhadas (brand kit, meta connection, client goal).
- Testabilidade: interfaces/mocks por domínio (padrão `ICampaignRepository` já existente)
  + testes de integração contra `fury_test`.
- Cada migração por domínio vira um PR revisável e testável.

### Negative
- Mais classes que um monolítico (mas bem menos que por-tabela).
- Decisão de **propriedade** de tabelas meta-conceito (ex.: `creativeAssets` — dono é o
  Studio; `CampaignRepository` delega a ele) precisa ser respeitada para evitar duplicação.

### Risks
- **Workers multi-tenant**: mitigado com `listTenants()` global + instanciação por tenant.
- **Queries GLOBAL** esquecidas em repo tenant-scoped: mitigado marcando métodos
  `GLOBAL`/estáticos.
- **Regressão**: mitigado com TDD e migração em ondas com suíte vitest isolada por domínio.
- Mapeamento completo das ~300 operações em `docs/tenant-repository-mapping.md`.