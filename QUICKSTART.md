# ⚡ FURY - Quick Start

Seu monorepo está pronto! Siga estes passos:

## 🎯 Começa em 1 Minuto

```bash
npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev
```

Isso irá:
1. ✅ Instalar todas as dependências
2. ✅ Subir PostgreSQL + Redis
3. ✅ Rodar migrations
4. ✅ Iniciar servidor na porta 3000

## ✨ Verificar Funcionamento

```bash
# Em outro terminal:
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45Z",
  "uptime": 25.3
}
```

## 📦 O que foi criado

✅ **Monorepo** - NPM Workspaces configurado
✅ **Backend** - Express + TypeScript ready
✅ **Database** - Drizzle ORM + PostgreSQL schema
✅ **Types** - Shared TypeScript types
✅ **Docker** - PostgreSQL 16 + Redis 7
✅ **RLS** - Row-Level Security scripts
✅ **Docs** - README, SETUP, STRUCTURE

## 📂 Estrutura

```
fury-app-v2/
├── apps/
│   ├── api/          (Express server)
│   └── web/          (Placeholder)
├── packages/
│   ├── db/           (Drizzle ORM)
│   └── shared/       (Types)
├── infra/            (Docker + .env)
└── docs/             (README, SETUP, etc)
```

## 🚀 Principais Comandos

```bash
npm run dev           # Desenvolvimento
npm run build         # Build
npm run lint          # Lint

npm run db:migrate    # Rodar migrations
npm run db:studio     # Visualizar BD (http://localhost:5555)
```

## 📚 Recursos

- 📖 **README.md** - Documentação completa
- 📖 **SETUP.md** - Instruções detalhadas de setup
- 📖 **STRUCTURE.md** - Árvore completa do projeto

## 🔧 Variáveis de Ambiente

Edite `infra/.env`:

```env
# Já configurado (não mudar):
DATABASE_URL=postgresql://fury:fury_local@localhost:5432/fury_dev
REDIS_URL=redis://localhost:6379

# Configure estes:
JWT_SECRET=your_secret_key_min_32_chars
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
ANTHROPIC_API_KEY=your_anthropic_key
```

## 🗄️ Banco de Dados

7 tabelas criadas com multi-tenancy (tenant_id):
- tenants
- users
- meta_connections
- campaigns
- creative_assets
- client_goals
- fury_insights

Explorar: `npm run db:studio`

## ⚠️ Se algo não funcionar

```bash
# Limpar containers e volumes
docker-compose -f infra/docker-compose.yml down
docker volume prune

# Reinstalar e começar
npm install
docker-compose -f infra/docker-compose.yml up -d
npm run db:migrate
npm run dev
```

## 📌 Próximas Etapas

1. Criar endpoints em `/apps/api/src/routes`
2. Adicionar controllers em `/apps/api/src/controllers`
3. Implementar autenticação JWT
4. Integrar Meta Ads API
5. Criar frontend em `/apps/web`

---

**Status:** ✅ Pronto para desenvolvimento

**Inicie com:** `npm install && docker-compose -f infra/docker-compose.yml up -d && npm run db:migrate && npm run dev`
