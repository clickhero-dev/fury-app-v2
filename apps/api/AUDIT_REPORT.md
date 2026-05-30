# FURY — Audit Report

**Data:** 2026-05-30  
**Escopo:** `apps/api/src/`, `packages/db/src/`, `packages/db/migrations/`  
**Método:** Leitura completa de todos os arquivos, sem alterações  

---

## 1. Lixo Identificado

### Arquivos soltos na raiz do monorepo (podem ser deletados com segurança)

| Arquivo | Tipo | Observação |
|---------|------|------------|
| `target_ctr` | Arquivo vazio (0B) | Redirecionamento bash acidental |
| `target_roas` | Arquivo vazio (0B) | Redirecionamento bash acidental |
| `GET` | Arquivo sem extensão (226B) | Saída acidental de comando `curl` |
| `.DS_Store` | macOS metadata | Deveria estar no `.gitignore` global |
| `dist/` | Build artifact | Diretório de build commitado; deveria estar no `.gitignore` |
| `AUTH_API_EXAMPLES.md` | Documentação ad-hoc | Mover para `docs/` ou deletar |
| `BUILD_FIX_SUMMARY.txt` | Notas de fix | Deletar |
| `CONFIGURAÇÃO_RAILWAY.md` | Notas de deploy | Mover para `docs/` ou deletar |
| `IMPLEMENTATION_SUMMARY.md` | Notas de implementação | Deletar |
| `MONOREPO_BUILD_FIX.md` | Notas de fix | Deletar |
| `PATCHES_OPTIONAL.md` | Notas de patches | Deletar |
| `QUICKSTART.md` | Duplica README | Deletar ou mesclar com README |
| `STUDIO_COPY_DEPLOY.md` | Notas de deploy | Deletar |
| `STUDIO_CREATIVE_READY_FINAL.md` | Notas de status | Deletar |
| `TEST_COMPLIANCE_WORKER.sh` | Script ad-hoc | Mover para `scripts/` ou deletar |
| `check_migrations.sql` | Script ad-hoc | Mover para `scripts/` ou deletar |
| `fix-monorepo-build.sh` | Script ad-hoc | Deletar |
| `reset_db.sql` | Script ad-hoc | Mover para `packages/db/scripts/` |
| `reset_db_full.sql` | Script ad-hoc | Mover para `packages/db/scripts/` |
| `test_insert.sql` | Script ad-hoc | Deletar |
| `test-qa.mjs` | Script ad-hoc | Deletar |

### Arquivo `.bak` commitado

- `apps/api/src/workers/budget-optimizer.worker.ts.bak` — backup manual commitado; deletar com segurança.

### Arquivo legado compilado

- `packages/db/src/schema.js` — arquivo `.js` compilado commitado junto com o `.ts` de origem; deve estar no `.gitignore`.

### Imports / variáveis não utilizados

- Nenhum import morto crítico identificado nos arquivos de rota — as principais issues estão nos blocos de código (ver seções abaixo).

---

## 2. Inconsistências Críticas

### 2.1 Secrets com valores default inseguros em produção

**`apps/api/src/lib/jwt.ts` linhas 4–5:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET ?? 'default-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'default-refresh-secret-key';
```
Se as variáveis de ambiente não estiverem configuradas no deploy, o servidor sobe com segredos públicos e qualquer pessoa pode forjar tokens JWT.

**`apps/api/src/lib/meta-api.ts` linha 7:**
```typescript
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY ?? 'fury-default-key';
```
Tokens Meta de usuários ficam criptografados com chave pública. Qualquer pessoa com o código consegue descriptografar.

**Fix:** Substituir o `??` por um `throw` explícito:
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
```

---

### 2.2 Dois sistemas de criptografia incompatíveis para tokens Meta

| Arquivo | Algoritmo | Chave |
|---------|-----------|-------|
| `services/meta.service.ts` | AES-256-**GCM** | SHA-256 de `JWT_SECRET` |
| `lib/providers/db-metrics.provider.ts` | AES-256-**GCM** | SHA-256 de `JWT_SECRET` |
| `lib/meta-api.ts` | AES-256-**CBC** | `scrypt` de `TOKEN_ENCRYPTION_KEY` |

Tokens encriptados por um sistema não podem ser lidos pelo outro. Se um token foi salvo via `meta.service.ts` e lido via `meta-api.ts` (ou vice-versa), a descriptografia falha silenciosamente ou gera string corrompida.

Adicionalmente, `meta-api.ts` usa `scrypt` com salt fixo hardcoded `'salt'`, o que anula o benefício de um KDF. Combine isso com a chave default e o ataque se torna trivial.

**Fix:** Unificar em um único helper de criptografia (`lib/crypto.ts`) usando AES-256-GCM com uma única variável de ambiente dedicada (`META_TOKEN_KEY`), separada do `JWT_SECRET`.

---

### 2.3 Mock de autenticação com bypass de middleware

**`apps/api/src/middleware/auth.middleware.ts`:**
```typescript
if (process.env.META_USE_MOCK === 'true' && process.env.NODE_ENV !== 'production') {
  // injeta usuário fake sem verificar token
}
```

`META_USE_MOCK` é uma flag semântica para dados de métricas (usa API real vs dados mock do Meta). Ela foi reaproveitada para bypassar autenticação em desenvolvimento, criando acoplamento indevido. Se `META_USE_MOCK` for ativada em um ambiente staging com `NODE_ENV=development`, toda autenticação cai.

**Fix:** Criar variável separada `AUTH_BYPASS_FOR_DEV=true` ou remover o bypass completamente.

---

### 2.4 Tabelas e enum sem migration SQL

As seguintes estruturas existem em `packages/db/src/schema.ts` mas **nunca foram criadas por nenhum arquivo `.sql` de migration**:

| Estrutura | Tipo | Status |
|-----------|------|--------|
| `performanceScores` | Tabela | Sem SQL de criação |
| `performance_grade` | Enum | Sem SQL de criação |

O runner custom em `packages/db/src/migrate.ts` aplica os arquivos `0000`, `0001` e `0002`, mas nenhum deles cria a tabela `performance_scores` nem o enum `performance_grade`. O banco de produção provavelmente não tem essas estruturas, causando erro em runtime em qualquer query que as use.

**Fix:** Criar migration `0003_add_performance_scores.sql` com:
```sql
CREATE TYPE "performance_grade" AS ENUM ('A', 'B', 'C', 'D', 'F');
CREATE TABLE "performance_scores" (...);
```

---

### 2.5 `enable_rls.sql` nunca aplicada

`packages/db/migrations/enable_rls.sql` existe no disco mas:
- Não está registrada no `meta/_journal.json` (apenas `0000` e `0001` constam)
- Não está na lista `STEPS` do runner custom `migrate.ts`

Se o arquivo define Row Level Security para isolamento de dados por tenant, a ausência de sua aplicação significa que o RLS não está ativo no banco de produção — qualquer query direta ao banco (fora da aplicação) pode acessar dados entre tenants.

**Fix:** Verificar se o RLS é necessário. Se sim, adicionar ao runner custom ou ao journal Drizzle e criar procedure de migração segura.

---

### 2.6 Worker `campaign-sync` órfão

`apps/api/src/workers/campaign-sync.worker.ts` define e exporta `createCampaignSyncWorker()` e cria a fila `campaign-sync`, mas essa função **nunca é chamada em `apps/api/src/index.ts`**.

Consequências:
- A fila `campaign-sync` é criada no Redis mas jamais consumida.
- O worker tem um `TODO` explícito (linha 233): `// TODO: integrar com OAuth real.`
- Usa `MOCK_ACCESS_TOKEN` e `MOCK_AD_ACCOUNT` hardcoded.

**Fix:** Ou inicializar o worker em `index.ts`, ou deletar o arquivo e remover a fila de `lib/queue.ts`.

---

### 2.7 Tabela `performance_rules` com campos duplicados no schema

Em `packages/db/src/schema.ts`, a tabela `automationRules` tem:
- `enabled: text().default('true')` — string representando booleano
- `isActive: boolean().default(true)` — booleano real

São dois campos para a mesma semântica. O controller `automation.controller.ts` salva `enabled` como string `'true'/'false'` e `isActive` como booleano. Queries que filtram por um ou outro campo retornam resultados inconsistentes dependendo de qual foi atualizado.

---

### 2.8 CORS hardcoded para localhost

**`apps/api/src/index.ts` linhas 24–25:**
```typescript
origin: ['http://localhost:5173', 'http://localhost:5174'],
```

Em produção (Railway), o frontend tem domínio diferente. O deploy atual provavelmente exige um patch manual toda vez.

**Fix:**
```typescript
origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'],
```

---

### 2.9 Estado em memória não sobrevive a restart

Três sistemas guardam estado crítico em memória que é perdido a cada deploy/crash:

| Módulo | Estado | Impacto |
|--------|--------|---------|
| `lib/sse.ts` | `Map<tenantId, Set<Response>>` — clientes SSE conectados | Clientes perdem conexão SSE sem reconexão automática |
| `services/budget-optimizer.service.ts` | `suggestionStorage: Map` e `configStorage: Map` | Sugestões de orçamento e configs são perdidas |
| `lib/temp-storage.ts` | Assets em `process.cwd()/tmp/studio-assets` | Imagens geradas desaparecem; também não funciona com múltiplas instâncias |

**Fix para SSE:** Redis pub/sub ou ioredis. **Fix para budget:** Redis com TTL. **Fix para assets:** Object storage (S3 ou Railway volume).

---

### 2.10 Migration `0002` fora do journal Drizzle

`packages/db/migrations/0002_add_performance_rules.sql` está na lista `STEPS` do runner custom (`migrate.ts`) mas **não está registrada no `meta/_journal.json`**. O journal lista apenas `idx 0` e `idx 1`.

Isso significa que ferramentas Drizzle (`drizzle-kit studio`, `drizzle-kit check`) não enxergam a migration `0002`, podendo gerar migrations conflitantes no futuro.

Adicionalmente, `0001_consolidated.sql` e `0002_add_performance_rules.sql` **criam as mesmas tabelas** (`performance_rules`, `rule_executions`). O runner usa `IF NOT EXISTS` para evitar erro, mas a sobreposição indica desorganização do histórico.

---

## 3. Inconsistências Menores

### 3.1 Filtro de `ruleExecutions` em memória

**`apps/api/src/routes/fury.routes.ts` linhas 236–247:**

O próprio código tem comentário explicando o workaround:
> "drizzle doesn't have inArray without sql helper in this pattern, filter in-memory after fetch"

O código busca todas as execuções e filtra em memória pelos IDs de regras do tenant. Se um tenant tiver muitas regras, isso retorna execuções de todos os tenants antes do filtro — potencial vazamento de dados e problema de performance.

**Fix:** Usar `inArray` do Drizzle (`import { inArray } from 'drizzle-orm'`) com o array de `ruleIds`.

---

### 3.2 `automation.controller.ts` — `budgetSmartHandler` com dados hardcoded

**`apps/api/src/controllers/automation.controller.ts` linhas 261–274:**

A função `budgetSmartHandler` retorna uma sugestão de orçamento com dados de campanha **completamente hardcoded** (não consulta o banco). Usuários recebem os mesmos dados fictícios independente das campanhas reais.

---

### 3.3 Modelo Claude sem variável de configuração

Dois modelos diferentes são usados sem configuração centralizada:
- `claude-3-5-sonnet-20241022` — em `services/studio-copy.service.ts` (compliance) e `services/fury-engine.service.ts`
- `claude-sonnet-4-20250514` — em `services/studio-copy.service.ts` (copy)

Se for necessário trocar o modelo, é preciso alterar múltiplos arquivos.

---

### 3.4 `campaign-sync.worker.ts` — `crypto.randomUUID()` sem import

**`apps/api/src/workers/rule-engine.worker.ts` linha 125:**

`crypto.randomUUID()` é chamado sem `import crypto from 'crypto'`. Funciona em Node.js 19+ onde `crypto` é global, mas é frágil e pode quebrar em versões menores.

---

### 3.5 Iteração sequencial sobre todos os tenants

`apps/api/src/workers/fury-engine.worker.ts` e `apps/api/src/workers/rule-engine.worker.ts` iteram todos os tenants em loop `for...of` sequencial. Com N tenants, cada job leva N × tempo_por_tenant. Não escala horizontalmente.

---

### 3.6 Worker `studio-generation` cria conexão Redis própria

`apps/api/src/workers/studio-generation.worker.ts` cria uma nova conexão Redis em vez de reutilizar o singleton de `lib/redis.ts`. Em deploys com limite de conexões Redis, isso pode causar `connection limit exceeded`.

---

### 3.7 Mistura de sistemas de fila

O projeto usa **BullMQ** para a maioria das filas, mas `lib/sync-jobs.ts` usa uma **lista Redis crua** com `BLPOP` blocking para a fila `meta:sync:queue`. Dois sistemas de fila distintos dificultam monitoramento unificado e aumentam surface de bugs.

---

### 3.8 Catches silenciosos sem log

| Arquivo | Linha | Impacto |
|---------|-------|---------|
| `apps/api/src/routes/goals.routes.ts` | 92 | `catch { /* no DB */ }` engole erro sem log |
| `apps/api/src/routes/goals.routes.ts` | 228 | idem |
| `apps/api/src/services/asaas.service.ts` | 29 | JSON parse com `{}` fallback silencioso |

---

### 3.9 Criptografia `meta.service.ts` usa `JWT_SECRET` para escopo diferente

Usar `JWT_SECRET` (segredo de autenticação) como chave de criptografia de tokens de terceiros (Meta) mistura escopos. Se o `JWT_SECRET` precisar ser rotacionado (ex: comprometimento), todos os tokens Meta armazenados ficam ilegíveis.

---

## 4. TODOs Pendentes

| Arquivo | Linha | Texto |
|---------|-------|-------|
| `apps/api/src/workers/campaign-sync.worker.ts` | 233 | `// TODO: integrar com OAuth real.` |

> Apenas 1 TODO formal encontrado. Os demais problemas estruturais estão em comentários inline descritivos (ex: o workaround `fury.routes.ts`) mas sem marcação `TODO`.

---

## 5. Variáveis de Ambiente não Documentadas

Variáveis **usadas no código** mas **ausentes no `apps/api/.env.example`**:

| Variável | Arquivo(s) | Observação |
|----------|-----------|------------|
| `META_REDIRECT_URI` | `services/meta.service.ts` | URI de callback OAuth — obrigatória para login Meta |
| `META_PAGE_ID` | `services/studio-image.service.ts` | ID da página Meta para publicação |
| `META_DEFAULT_LINK_URL` | `services/studio-image.service.ts` | URL padrão de destino de anúncios |
| `META_API_MOCK` | `lib/meta-api.ts` | Alias confuso; diferente de `META_USE_MOCK` já documentado |
| `META_TEST_TOKEN` | `workers/campaign-sync.worker.ts` | Token mock para worker órfão |
| `META_TEST_AD_ACCOUNT` | `workers/campaign-sync.worker.ts` | Ad account mock para worker órfão |
| `TOKEN_ENCRYPTION_KEY` | `lib/meta-api.ts` | Chave de criptografia AES de tokens Meta |
| `PUBLIC_BASE_URL` | `controllers/studio.controller.ts` | URL base para URLs públicas de assets |
| `CORS_ALLOWED_ORIGINS` | — (não existe ainda) | Deveria existir; CORS está hardcoded |

### Variáveis documentadas com defaults perigosos em código

| Variável | Arquivo | Default no código |
|----------|---------|-------------------|
| `JWT_SECRET` | `lib/jwt.ts:4` | `'default-secret-key'` |
| `JWT_REFRESH_SECRET` | `lib/jwt.ts:5` | `'default-refresh-secret-key'` |
| `TOKEN_ENCRYPTION_KEY` | `lib/meta-api.ts:7` | `'fury-default-key'` |
| `DATABASE_URL` | `packages/db/src/client.ts` | `postgresql://fury:fury_local@localhost:5432/fury_dev` |

### Confusão `META_USE_MOCK` vs `META_API_MOCK`

Duas variáveis com semântica próxima mas aplicadas em lugares diferentes:
- `META_USE_MOCK` — usada em services, routes, providers (dados mock do Meta)
- `META_API_MOCK` — usada apenas em `lib/meta-api.ts` (bypass de chamada HTTP)

---

## 6. Workers e Rotas não Registrados

### Worker órfão — não inicializado em `index.ts`

| Worker | Fila | Função exportada | Chamada em `index.ts` |
|--------|------|------------------|----------------------|
| `campaign-sync.worker.ts` | `campaign-sync` | `createCampaignSyncWorker` | **Nunca** |

A fila `campaign-sync` é instanciada em `lib/queue.ts` (ocupando slot Redis), mas nenhum consumer a processa.

### Rotas — todas registradas

Todos os arquivos em `apps/api/src/routes/` estão montados via `routes/index.ts`, que é registrado em `index.ts`. Não há rotas órfãs.

| Arquivo de rota | Mount | Status |
|-----------------|-------|--------|
| `health.ts` | `/api/health` | ✅ |
| `auth.routes.ts` | `/api/auth` | ✅ |
| `meta.routes.ts` | `/api/meta` | ✅ |
| `metrics.routes.ts` | `/api/metrics` | ✅ |
| `automation.routes.ts` | `/api/automation` | ✅ |
| `studio.routes.ts` | `/api/studio` | ✅ |
| `campaigns.routes.ts` | `/api/campaigns` | ✅ |
| `budget.routes.ts` | `/api/budget` | ✅ |
| `fury.routes.ts` | `/api/fury` | ✅ |
| `goals.routes.ts` | `/api/goals` | ✅ |
| `billing.routes.ts` | `/api/billing` | ✅ |

---

## 7. Sugestões de Fixes

### P0 — Segurança (fazer antes do próximo deploy)

**[SEC-1] Remover defaults de secrets:**
```typescript
// lib/jwt.ts — substituir:
const JWT_SECRET = process.env.JWT_SECRET ?? 'default-secret-key';
// por:
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
```
Idem para `JWT_REFRESH_SECRET` e `TOKEN_ENCRYPTION_KEY`.

**[SEC-2] Unificar criptografia Meta:**  
Criar `lib/crypto.ts` com AES-256-GCM usando variável dedicada `META_TOKEN_KEY`. Migrar `meta.service.ts`, `db-metrics.provider.ts` e `meta-api.ts` para usar o mesmo helper.

**[SEC-3] Isolar flag de mock de auth:**  
Renomear a variável de bypass em `auth.middleware.ts` para `AUTH_BYPASS_DEV` e remover dependência de `META_USE_MOCK`.

**[SEC-4] Aplicar RLS ou documentar que não é necessário:**  
Decidir se `enable_rls.sql` deve ser aplicada. Se sim, adicioná-la ao runner custom `migrate.ts` na lista `STEPS`.

---

### P1 — Banco de dados

**[DB-1] Criar migration `0003` para `performance_scores`:**
```sql
CREATE TYPE "performance_grade" AS ENUM ('A', 'B', 'C', 'D', 'F');
CREATE TABLE IF NOT EXISTS "performance_scores" (
  -- campos conforme schema.ts
);
```
Adicionar ao `STEPS` do `migrate.ts` e ao `_journal.json`.

**[DB-2] Resolver duplicação `enabled` vs `isActive` em `automationRules`:**  
Deprecar `enabled` (text) e migrar toda lógica para `isActive` (boolean) via migration `ALTER TABLE automationRules DROP COLUMN enabled` após atualizar o controller.

**[DB-3] Registrar `0002` no `_journal.json`** para que ferramentas Drizzle enxerguem o histórico completo.

---

### P1 — Workers

**[WORKER-1] Resolver worker `campaign-sync`:**  
Opção A — Inicializar em `index.ts`:
```typescript
const { createCampaignSyncWorker } = await import('./workers/campaign-sync.worker.js');
void createCampaignSyncWorker().catch(console.error);
```
Opção B — Deletar `campaign-sync.worker.ts` e remover `CAMPAIGN_SYNC_QUEUE_NAME` de `lib/queue.ts` se a funcionalidade não for necessária.

**[WORKER-2] Mover estado in-memory para Redis:**
- `lib/sse.ts` → Redis pub/sub para SSE multi-instância
- `services/budget-optimizer.service.ts` → `ioredis.hset`/`hget` com TTL
- `lib/temp-storage.ts` → Object storage ou Railway volume persistente

---

### P2 — Configuração

**[ENV-1] Documentar variáveis faltantes no `.env.example`:**
```env
META_REDIRECT_URI=http://localhost:3000/api/meta/callback
META_PAGE_ID=
META_DEFAULT_LINK_URL=https://example.com
TOKEN_ENCRYPTION_KEY=  # must be 32+ chars random string
PUBLIC_BASE_URL=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

**[ENV-2] Centralizar modelo Claude:**
```env
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MODEL_COMPLIANCE=claude-3-5-sonnet-20241022
```
E substituir strings hardcoded nos services.

**[ENV-3] Substituir CORS hardcoded:**
```typescript
origin: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
```

---

### P3 — Higiene

**[CLEAN-1] Deletar da raiz:**
`target_ctr`, `target_roas`, `GET`, `.DS_Store`, `dist/`, `BUILD_FIX_SUMMARY.txt`, `IMPLEMENTATION_SUMMARY.md`, `MONOREPO_BUILD_FIX.md`, `PATCHES_OPTIONAL.md`, `STUDIO_CREATIVE_READY_FINAL.md`, `test_insert.sql`, `test-qa.mjs`, `check_migrations.sql`, `fix-monorepo-build.sh`

**[CLEAN-2] Adicionar ao `.gitignore` na raiz:**
```gitignore
dist/
*.bak
.DS_Store
packages/db/src/*.js
```

**[CLEAN-3] Deletar:**
- `apps/api/src/workers/budget-optimizer.worker.ts.bak`
- `packages/db/src/schema.js`

**[CLEAN-4] Substituir `console.*` por logger estruturado (pino):**
117 ocorrências distribuídas em 21 arquivos. Principais ofensores:
- `apps/api/src/index.ts` — 11 `console.log` de startup
- `services/budget-optimizer.service.ts` — `console.warn`, `console.log`
- `workers/compliance-check.worker.ts` — 15 ocorrências

**[CLEAN-5] Reduzir `any`:**
117 ocorrências em 25 arquivos. Prioridade:
1. `services/studio.service.ts` — 17 ocorrências
2. `routes/studio.routes.ts` — 13 ocorrências
3. `services/campaigns.service.ts` — 11 ocorrências

---

## Resumo Executivo

| Categoria | Contagem | Severidade |
|-----------|----------|-----------|
| Problemas de segurança críticos | 4 | 🔴 P0 |
| Inconsistências de schema/migration | 4 | 🔴 P1 |
| Workers/estado com problemas arquiteturais | 4 | 🔴 P1 |
| Variáveis de ambiente não documentadas | 9 | 🟠 P1 |
| Inconsistências menores de código | 9 | 🟡 P2 |
| Itens de higiene/limpeza | 5 grupos | 🟢 P3 |
| TODOs formais | 1 | 🟢 P3 |
| `any` TypeScript | 117 ocorrências | 🟡 P2 |
| `console.*` em produção | 117 ocorrências | 🟡 P2 |

**Quick wins de impacto imediato (< 30 min cada):**
1. Remover defaults perigosos de JWT e encryption keys → `lib/jwt.ts`, `lib/meta-api.ts`
2. Documentar 9 variáveis faltantes → `apps/api/.env.example`
3. Adicionar CORS via env var → `apps/api/src/index.ts:24`
4. Deletar lixo da raiz (20+ arquivos/dirs) → `rm` + `.gitignore`
5. Resolver worker órfão → inicializar ou deletar `campaign-sync.worker.ts`
