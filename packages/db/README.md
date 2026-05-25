# @fury/db

Pacote de banco de dados do projeto FURY. Contém schema Drizzle ORM, migrations e seeds para PostgreSQL via Neon.

## Setup

Copie o arquivo de exemplo e preencha com as URLs do Neon:

```bash
cp .env.example .env
```

`.env` esperado:

```
DATABASE_URL=postgresql://...
TEST_DATABASE_URL=postgresql://...
```

## Migrations

```bash
# Banco de desenvolvimento
npm run migrate

# Banco de teste
NODE_ENV=test npm run migrate
```

O script carrega automaticamente as variáveis de `packages/db/.env` — não é necessário passá-las manualmente.

## Outros comandos

```bash
npm run generate   # Gera nova migration a partir do schema
npm run studio     # Abre o Drizzle Studio
npm run db:seed    # Popula o banco com dados iniciais
npm run build      # Compila para dist/
```
