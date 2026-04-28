# 📁 Estrutura do Monorepo FURY

```
fury-app-v2/
│
├── 📄 package.json                    (Root - NPM Workspaces)
├── 📄 tsconfig.json                   (Root - Path aliases)
├── 📄 README.md                        (Documentação principal)
├── 📄 SETUP.md                         (Instruções de setup)
├── 📄 STRUCTURE.md                     (Este arquivo)
├── 📄 .gitignore
│
├── 📂 infra/                           (Infraestrutura)
│   ├── docker-compose.yml             ✅ PostgreSQL 16 + Redis 7
│   └── .env.example                   ✅ Variáveis de ambiente
│
├── 📂 apps/
│   │
│   ├── 📂 api/                        (Backend Principal)
│   │   ├── package.json               ✅ Express + TypeScript
│   │   ├── tsconfig.json
│   │   └── 📂 src/
│   │       ├── index.ts               ✅ Servidor Express (port 3000)
│   │       ├── 📂 routes/
│   │       │   ├── index.ts           ✅ Router principal
│   │       │   └── health.ts          ✅ GET /health endpoint
│   │       ├── 📂 controllers/        (Controllers - vazio, pronto para criar)
│   │       ├── 📂 services/           (Lógica de negócio - vazio)
│   │       ├── 📂 middleware/
│   │       │   ├── errorHandler.ts    ✅ Tratamento de erros global
│   │       │   └── logger.ts          ✅ Logger de requisições
│   │       └── 📂 workers/            (Background jobs - vazio)
│   │
│   └── 📂 web/                        (Frontend - Placeholder)
│       └── package.json               ✅ Pronto para React/Vue/Svelte
│
├── 📂 packages/
│   │
│   ├── 📂 db/                         (Database + Drizzle ORM)
│   │   ├── package.json               ✅ Drizzle ORM + PostgreSQL
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts          ✅ Configuração Drizzle
│   │   ├── 📂 src/
│   │   │   ├── schema.ts              ✅ 7 tabelas:
│   │   │   │                            - tenants
│   │   │   │                            - users (role: owner/admin/member)
│   │   │   │                            - meta_connections
│   │   │   │                            - campaigns
│   │   │   │                            - creative_assets
│   │   │   │                            - client_goals
│   │   │   │                            - fury_insights
│   │   │   ├── client.ts              ✅ Cliente Drizzle
│   │   │   ├── migrate.ts             ✅ Script de migration
│   │   │   └── index.ts               ✅ Exports
│   │   └── 📂 migrations/
│   │       └── enable_rls.sql         ✅ RLS (Row-Level Security)
│   │
│   └── 📂 shared/                     (Tipos TypeScript Compartilhados)
│       ├── package.json               ✅ Zod included
│       ├── tsconfig.json
│       └── 📂 src/
│           ├── enums.ts               ✅ UserRole, CreativeType, etc
│           ├── types.ts               ✅ Interfaces de entidades
│           ├── api.ts                 ✅ ApiResponse<T>, PaginatedResponse<T>
│           └── index.ts               ✅ Exports
│
└── .git/                               (Git repository)
```

---

## 📊 Detalhes de Cada Camada

### 🗄️ Database Layer (`/packages/db`)

**Tabelas Criadas:**

| Tabela | Campos Principais | Segurança |
|--------|------------------|-----------|
| `tenants` | id, name, slug, created_at | Isolamento |
| `users` | id, tenant_id, email, password_hash, role | RLS + Foreign Key |
| `meta_connections` | id, tenant_id, meta_user_id, access_token | RLS + Foreign Key |
| `campaigns` | id, tenant_id, meta_campaign_id, status, metrics | RLS + Foreign Key |
| `creative_assets` | id, tenant_id, type, url, compliance_status | RLS + Foreign Key |
| `client_goals` | id, tenant_id, objective, monthly_budget, target_cpa | RLS + Foreign Key |
| `fury_insights` | id, tenant_id, campaign_id, suggestion_type | RLS + Foreign Key |

**Enums PostgreSQL:**
- `user_role`: owner, admin, member
- `creative_type`: image, video, copy
- `compliance_status`: pending, approved, rejected
- `campaign_status`: draft, active, paused, archived

---

### 📝 Shared Types (`/packages/shared`)

**Exports:**

```typescript
// Enums
UserRole, CreativeType, ComplianceStatus, CampaignStatus

// Entities
Tenant, User, MetaConnection, Campaign, CreativeAsset, ClientGoal, FuryInsight

// DTOs
UserDTO, CreateUserRequest, CreateCampaignRequest, etc

// API
ApiResponse<T>, PaginatedResponse<T>, PaginatedApiResponse<T>, HealthCheckResponse
```

---

### 🚀 API Server (`/apps/api`)

**Estrutura:**

```
src/
├── index.ts              # Server entry point, port 3000
├── routes/               # Route definitions
│   ├── index.ts          # Main router
│   └── health.ts         # Health check endpoint
├── controllers/          # Business logic (ready to extend)
├── services/             # Service layer (ready to extend)
├── middleware/           # Express middleware
│   ├── errorHandler.ts   # Global error handler (Zod validation support)
│   └── logger.ts         # Request logger
└── workers/              # Background jobs (ready to extend)
```

**Features:**
- ✅ Express.js com TypeScript
- ✅ Validação com Zod
- ✅ Tratamento global de erros
- ✅ Logger de requisições
- ✅ Graceful shutdown
- ✅ Health check endpoint

---

## 🔄 Dependências Entre Pacotes

```
@fury/api
  ├── @fury/shared     (tipos, enums)
  └── @fury/db         (cliente, schema)

@fury/shared
  └── zod              (validação)

@fury/db
  ├── drizzle-orm
  ├── postgres         (driver)
  └── @fury/shared     (tipos)

@fury/web
  └── (vazio, pronto para framework)
```

---

## 🚀 Comandos Principais

```bash
# Monorepo Root
npm install                                    # Instalar tudo
npm run dev                                    # Dev em todos
npm run build                                  # Build em todos
npm run lint                                   # Lint em todos

# Database
npm run db:migrate                             # Rodar migrations
npm run db:studio                              # Abrir Drizzle Studio

# Workspaces Específicos
npm run dev --workspace @fury/api              # Só API
npm run build --workspace @fury/db             # Só DB
npm run build --workspace @fury/shared         # Só Shared
```

---

## 📋 Checklist de Setup

- [ ] `npm install` - Instalar dependências
- [ ] `cp infra/.env.example infra/.env` - Criar .env
- [ ] Editar `infra/.env` com variáveis necessárias
- [ ] `docker-compose -f infra/docker-compose.yml up -d` - Subir containers
- [ ] `npm run db:migrate` - Rodar migrations
- [ ] `npm run dev` - Iniciar desenvolvimento
- [ ] `curl http://localhost:3000/health` - Verificar health

---

## 📚 Stack Tecnológico

| Camada | Tecnologias |
|--------|------------|
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL 16, Drizzle ORM |
| **Cache** | Redis 7 |
| **Validation** | Zod |
| **Package Manager** | npm (workspaces) |
| **Infraestrutura** | Docker, Docker Compose |
| **RLS/Security** | PostgreSQL Row-Level Security |

---

## 🔒 Segurança Implementada

✅ **Multi-Tenancy:** Todas as tabelas têm `tenant_id`
✅ **Foreign Keys:** Integridade referencial
✅ **RLS:** Row-Level Security pronto em SQL
✅ **Enums:** Validação em BD
✅ **Error Handling:** Handler global com Zod support
✅ **Graceful Shutdown:** Servidor fecha corretamente

---

**Status:** ✅ Pronto para desenvolvimento

**Próximo:** `npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev`
