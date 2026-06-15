# FURY - Paid Traffic Automation Platform

Uma plataforma SaaS de automação de tráfego pago que integra com Meta Ads API.

> **Estúdio de Criação (jun/2026):** os 4 layouts antigos foram substituídos por
> **5 arquétipos visuais** com seleção automática via Layout Selector Agent
> (DeepSeek) e renderização em `@napi-rs/canvas`. Ver
> [`apps/api/docs/CREATIVE_STUDIO_ARCHETYPES.md`](apps/api/docs/CREATIVE_STUDIO_ARCHETYPES.md).

## 📋 Estrutura do Monorepo

```
fury/
├── apps/
│   ├── api/          # Backend Node.js + Express + TypeScript
│   └── web/          # Frontend (placeholder)
├── packages/
│   ├── shared/       # Tipos TypeScript compartilhados
│   └── db/           # Drizzle ORM + Schema PostgreSQL
├── infra/            # Docker Compose + Environment
└── package.json      # NPM Workspaces
```

## 🚀 Início Rápido

### Pré-requisitos

- Node.js >= 18
- Docker & Docker Compose
- npm (vem com Node.js)

### Setup Inicial

1. **Instalar dependências do monorepo:**

```bash
npm install
```

2. **Configurar variáveis de ambiente:**

```bash
# Copiar arquivo de exemplo
cp infra/.env.example infra/.env

# Editar infra/.env com suas configurações
# Mínimo necessário:
# - DATABASE_URL
# - REDIS_URL
# - JWT_SECRET
# - META_APP_ID / META_APP_SECRET
# - ANTHROPIC_API_KEY
```

3. **Iniciar infraestrutura (PostgreSQL + Redis):**

```bash
docker-compose -f infra/docker-compose.yml up -d
```

4. **Rodar migrations do banco de dados:**

```bash
npm run db:migrate
```

5. **Iniciar servidor de desenvolvimento:**

```bash
npm run dev
```

## 🔄 Comando Único para Tudo

```bash
npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev
```

### Comandos Disponíveis

```bash
# Desenvolvimento (todos os apps)
npm run dev

# Build (todos os apps)
npm run build

# Lint (todos os apps)
npm run lint

# Database
npm run db:migrate   # Rodar migrations
npm run db:studio    # Abrir Drizzle Studio

# App específico
npm run dev --workspace @fury/api
npm run build --workspace @fury/db
```

## 📦 Pacotes

### @fury/api
Backend Express com rotas e controllers.

**Estrutura:**
- `/src/routes` - Definição de rotas
- `/src/controllers` - Lógica de controllers
- `/src/services` - Lógica de negócio
- `/src/middleware` - Middlewares (erro, auth, etc)
- `/src/workers` - Background jobs

**Health Check:**
```bash
curl http://localhost:3000/health
```

### @fury/db
Drizzle ORM com schema PostgreSQL.

**Tabelas:**
- `tenants` - Organizações/Clientes
- `users` - Usuários (com tenant_id para isolamento)
- `meta_connections` - Conexões com Meta Ads
- `campaigns` - Campanhas publicitárias
- `creative_assets` - Assets criativos (imagens, vídeos, copy)
- `client_goals` - Objetivos dos clientes
- `fury_insights` - Sugestões de automação

**Segurança:**
- Row-Level Security (RLS) habilitado em todas as tabelas
- Isolamento por `tenant_id`

### @fury/shared
Tipos TypeScript e interfaces compartilhadas.

**Exports:**
- Enums (UserRole, CreativeType, ComplianceStatus, CampaignStatus)
- Interfaces (Tenant, User, Campaign, etc)
- DTOs (Data Transfer Objects)
- ApiResponse<T> e PaginatedResponse<T>

## 🗄️ Banco de Dados

### Conexão

```
Host: localhost
Port: 5432
Database: fury_dev
User: fury
Password: fury_local
```

### Explorar Schema

```bash
npm run db:studio
```

Abre interface visual do Drizzle Studio em `http://localhost:5555`

## 🔧 Variáveis de Ambiente

Ver `infra/.env.example` para todas as variáveis necessárias.

**Principais:**
- `DATABASE_URL` - Conexão PostgreSQL
- `REDIS_URL` - Conexão Redis
- `JWT_SECRET` - Chave para assinar JWTs
- `META_APP_ID` / `META_APP_SECRET` - Credenciais Meta Ads API
- `OPENAI_API_KEY` - API key para geração de imagens com DALL-E 3
- `ANTHROPIC_API_KEY` - API key para Claude/Anthropic
- `PORT` - Porta do servidor (default: 3000)

## 📝 Validação

Utilizamos **Zod** para validação de schemas em toda a API.

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
```

## 🐛 Troubleshooting

**Docker não consegue conectar:**
```bash
docker-compose -f infra/docker-compose.yml down
docker volume prune
docker-compose -f infra/docker-compose.yml up -d
```

**Migrations falhando:**
```bash
# Verificar se PostgreSQL está rodando
docker ps | grep postgres

# Checar logs
docker logs fury-postgres
```

**Porta 5432 / 6379 já em uso:**
Editar `infra/.env` com portas diferentes e reiniciar containers.

## 📚 Próximos Passos

- [ ] Implementar autenticação (JWT)
- [ ] Criar endpoints da API
- [ ] Integrar Meta Ads API
- [ ] Setup frontend React/Vue
- [ ] Implementar websockets para real-time
- [ ] Adicionar testes automatizados
- [ ] Setup CI/CD (GitHub Actions)

## 📖 Documentação

- [Drizzle ORM](https://orm.drizzle.team)
- [Express.js](https://expressjs.com)
- [Zod](https://zod.dev)
- [Meta Ads API](https://developers.facebook.com/docs/marketing-apis)

## 📄 Licença

Proprietary - FURY Platform