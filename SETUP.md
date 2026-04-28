# 🚀 Setup do Monorepo FURY

Este documento descreve o que foi criado e como começar.

## ✅ O que foi criado

### Estrutura Base
- ✅ Monorepo Node.js com NPM workspaces
- ✅ TypeScript configurado com path aliases
- ✅ 5 tasks de desenvolvimento rastreadas

### Infraestrutura (`/infra`)
- ✅ `docker-compose.yml` com PostgreSQL 16 e Redis 7
- ✅ `.env.example` com todas as variáveis necessárias
- ✅ Health checks para ambos os serviços

### Pacote de Banco de Dados (`/packages/db`)
- ✅ Drizzle ORM configurado com PostgreSQL
- ✅ 7 tabelas criadas com tenant_id para multi-tenancy:
  - `tenants` - Organização/Cliente
  - `users` - Usuários (role: owner/admin/member)
  - `meta_connections` - Conexões com Meta Ads API
  - `campaigns` - Campanhas publicitárias
  - `creative_assets` - Assets criativos (image/video/copy)
  - `client_goals` - Objetivos dos clientes
  - `fury_insights` - Sugestões de automação
- ✅ RLS (Row-Level Security) preparado em `enable_rls.sql`
- ✅ Scripts: `npm run db:migrate` e `npm run db:studio`

### Pacote Compartilhado (`/packages/shared`)
- ✅ Enums: UserRole, CreativeType, ComplianceStatus, CampaignStatus
- ✅ Interfaces para todas as entidades
- ✅ DTOs (Data Transfer Objects)
- ✅ Tipos ApiResponse<T> e PaginatedResponse<T>
- ✅ HealthCheckResponse

### API (`/apps/api`)
- ✅ Express.js + TypeScript
- ✅ Estrutura: routes, controllers, services, middleware, workers
- ✅ GET `/health` endpoint com timestamp e uptime
- ✅ Middleware global de erro com Zod validation
- ✅ Logger middleware para todas as requisições
- ✅ Graceful shutdown
- ✅ Script: `npm run dev`

### Web (`/apps/web`)
- ✅ Placeholder vazio com package.json

---

## 🔧 Instalação e Execução

### Opção 1: Comando Único (Recomendado)

```bash
npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev
```

Este comando:
1. Instala todas as dependências (monorepo)
2. Sobe PostgreSQL + Redis em containers
3. Roda as migrations do banco
4. Inicia o servidor em desenvolvimento

### Opção 2: Passo a Passo

#### 1. Instalar dependências
```bash
npm install
```

#### 2. Configurar ambiente
```bash
cp infra/.env.example infra/.env

# Edite infra/.env com:
# - DATABASE_URL (já configurada para localhost)
# - JWT_SECRET (gere uma chave segura)
# - META_APP_ID e META_APP_SECRET
# - ANTHROPIC_API_KEY
```

#### 3. Iniciar infraestrutura
```bash
docker-compose -f infra/docker-compose.yml up -d
```

Verificar se está rodando:
```bash
docker ps
# Deve aparecer fury-postgres e fury-redis
```

#### 4. Rodar migrations
```bash
npm run db:migrate
```

#### 5. Iniciar server
```bash
npm run dev
```

Server deve estar em http://localhost:3000

---

## 📝 Verificar Instalação

### Health Check
```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "uptime": 123.456
}
```

### Explorar Banco de Dados
```bash
npm run db:studio
```

Abre http://localhost:5555 com interface visual do Drizzle

### Verificar Containers
```bash
docker ps
docker logs fury-postgres
docker logs fury-redis
```

---

## 📦 Scripts Disponíveis

```bash
# Todos os workspaces
npm run dev      # Desenvolvimento
npm run build    # Build
npm run lint     # Lint

# Banco de dados
npm run db:migrate  # Rodar migrations
npm run db:studio   # Abrir Drizzle Studio

# Workspace específico
npm run dev --workspace @fury/api
npm run build --workspace @fury/db
npm run build --workspace @fury/shared
```

---

## 🗄️ Detalhes do Banco

**PostgreSQL:**
- Host: `localhost`
- Port: `5432`
- Database: `fury_dev`
- User: `fury`
- Password: `fury_local`

**Redis:**
- Host: `localhost`
- Port: `6379`

---

## 🔒 Segurança

### Multi-Tenancy
Todas as tabelas têm `tenant_id` para isolar dados por cliente.

### RLS (Row-Level Security)
Para habilitar RLS no PostgreSQL:

```bash
# Conectar ao PostgreSQL
psql postgresql://fury:fury_local@localhost:5432/fury_dev

# Executar script (manual por enquanto)
\i packages/db/migrations/enable_rls.sql
```

Isso cria políticas que isolam dados por `tenant_id`.

---

## 📚 Próximas Etapas

1. **Autenticação** - Implementar JWT em `/apps/api/src/middleware/auth.ts`
2. **Endpoints** - Criar controllers e routes para CRUD das entidades
3. **Meta Ads Integration** - Integrar SDK da Meta Ads API
4. **Frontend** - Substituir `/apps/web` com React/Vue/Svelte
5. **Testes** - Adicionar Jest/Vitest
6. **CI/CD** - GitHub Actions

---

## ❓ Troubleshooting

### "Cannot find module '@fury/shared'"
```bash
npm install  # Rodar novamente
npm run build  # Build de todos os pacotes
```

### PostgreSQL connection refused
```bash
docker-compose -f infra/docker-compose.yml logs postgres
docker-compose -f infra/docker-compose.yml down
docker volume prune
docker-compose -f infra/docker-compose.yml up -d
```

### Porta 5432/6379 em uso
Editar `infra/.env`:
```env
POSTGRES_PORT=5433
REDIS_PORT=6380
```

### Migrations não rodam
```bash
# Verificar variável de ambiente
echo $DATABASE_URL

# Ou especificar manualmente
DATABASE_URL="postgresql://fury:fury_local@localhost:5432/fury_dev" npm run db:migrate
```

---

## 📖 Documentação Útil

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [Express.js Guide](https://expressjs.com/en/starter/basic-routing.html)
- [Zod Validation](https://zod.dev)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Meta Ads API](https://developers.facebook.com/docs/marketing-apis)

---

**Status**: ✅ Pronto para desenvolvimento

**Próximo passo**: `npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev`
