# Quickstart: Planejador IA

## Pré-requisitos

- API rodando: `http://localhost:3000` (via `pnpm dev` em `apps/api`)
- Frontend rodando: `http://localhost:5173` (via `pnpm dev` em `apps/web`)
- PostgreSQL: container `fury-postgres` na porta 5444
- Migration aplicada: `0023_planner_tables`

## Setup

```bash
# 1. Migration (já aplicada)
cd packages/db && npm run migrate

# 2. API
cd apps/api && pnpm dev

# 3. Frontend
cd apps/web && pnpm dev
```

## Cenários de Teste

### C1: Geração One-Shot (core)

1. Acessar `http://localhost:5173/planejador`
2. Verificar checklist de pré-requisitos
3. Clicar "Gerar planejamento"
4. Observar progresso animado (12 passos)
5. Ver resumo do plano
6. Clicar "Ver calendário"
7. Ver grid mensal com cards

**Esperado**: Todo o fluxo sem formulários, sem inputs, em < 60s.

### C2: Navegação no Calendário

1. Verificar cards por tipo (ícone + cor)
2. Clicar em um card → painel lateral abre
3. Ver preview: legenda, CTA, hashtags, prompt
4. Fechar painel

**Esperado**: Painel lateral sem troca de página.

### C3: Edição via Chat IA

1. Abrir painel lateral de um post
2. Digitar instrução no chat (ex: "Torne mais profissional")
3. Ver conteúdo regenerado

**Esperado**: Apenas o post selecionado é alterado.

### C4: Aprovação em Massa

1. Na barra de aprovação do calendário, ver resumo
2. Clicar "Agendar tudo"
3. Ver status mudar para "scheduled"

**Esperado**: Todos os posts aprovados com um clique.

## Estrutura de Arquivos

```
specs/002-planejador-ia/      ← Documentação da feature
packages/db/src/schema.ts      ← + campaignPlans, socialPosts
packages/db/migrations/        ← + 0023_planner_tables.sql
apps/api/src/routes/            ← + planner.routes.ts
apps/api/src/controllers/       ← + planner.controller.ts
apps/api/src/services/          ← + planner.service.ts
apps/web/src/pages/planejador/  ← Página + 5 componentes
apps/web/src/lib/api.ts         ← VITE_API_URL
apps/web/src/router.tsx         ← + /planejador
apps/web/src/components/Sidebar.tsx  ← + nav item
apps/web/vite.config.ts         ← proxy /api → localhost:3000
apps/web/.env                   ← VITE_API_URL
```
