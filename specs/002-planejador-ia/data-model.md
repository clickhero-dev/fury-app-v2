# Data Model: Planejador IA

## CampaignPlan

Tabela que armazena o plano mensal gerado pela IA.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Identificador único |
| tenant_id | uuid | FK → tenants.id, NOT NULL | Empresa dona do plano |
| month | integer | NOT NULL, CHECK(1-12) | Mês do plano |
| year | integer | NOT NULL | Ano do plano |
| objective | text | nullable | Objetivo do mês (ex: "Aumentar engajamento") |
| status | plan_status | NOT NULL, default 'draft' | draft → generating → completed → failed |
| post_count | integer | default 0 | Total de posts gerados |
| reels_count | integer | default 0 | Quantidade de Reels |
| carousel_count | integer | default 0 | Quantidade de Carrosséis |
| image_count | integer | default 0 | Quantidade de Posts imagem |
| stories_count | integer | default 0 | Stories sugeridos |
| insights | jsonb | nullable | Dados de entrada da IA (brandKit, goals, etc) |
| embedding | vector(768) | nullable | Embedding do plano para busca semântica futura |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

**Indexes**:
- `campaign_plans_tenant_month_year_idx` UNIQUE on (tenant_id, month, year) — um plano por mês por tenant
- `campaign_plans_tenant_idx` on (tenant_id)
- `campaign_plans_status_idx` on (status)

## SocialPost

Cada post individual dentro de um plano.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Identificador único |
| plan_id | uuid | FK → campaign_plans.id, NOT NULL | Plano pai |
| type | post_type | NOT NULL | reel, carousel, image, stories |
| title | text | NOT NULL | Título do post |
| caption | text | nullable | Legenda/texto principal |
| cta | text | nullable | Call-to-action |
| hashtags | text[] | nullable | Array de hashtags |
| image_prompt | text | nullable | Prompt para geração de imagem |
| image_url | text | nullable | URL da imagem gerada |
| objective | text | nullable | Objetivo específico do post |
| scheduled_date | date | nullable | Data no calendário |
| scheduled_time | time | nullable | Horário de publicação |
| sort_order | integer | default 0 | Ordem no dia |
| status | post_status | NOT NULL, default 'draft' | draft, approved, scheduled, published |
| insights | jsonb | nullable | Métricas pós-publicação |
| embedding | vector(768) | nullable | Embedding do post para similaridade |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

**Indexes**:
- `social_posts_plan_idx` on (plan_id)
- `social_posts_date_idx` on (scheduled_date)
- `social_posts_status_idx` on (status)
- `social_posts_plan_date_idx` on (plan_id, scheduled_date)

## PlannerJob

Rastreamento de job de geração em andamento.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Identificador único |
| tenant_id | uuid | FK → tenants.id, NOT NULL | Empresa |
| plan_id | uuid | FK → campaign_plans.id, nullable | Plano gerado (setado ao completar) |
| status | text | NOT NULL, default 'pending' | pending, processing, completed, failed |
| progress | integer | default 0 | 0-100 |
| current_step | text | nullable | Nome do passo atual (ex: "Entendendo sua empresa") |
| error | text | nullable | Mensagem de erro se failed |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

## Enums

```sql
CREATE TYPE post_type AS ENUM ('reel', 'carousel', 'image', 'stories');
CREATE TYPE post_status AS ENUM ('draft', 'approved', 'scheduled', 'published');
CREATE TYPE plan_status AS ENUM ('draft', 'generating', 'completed', 'failed');
```

## Relationships

```
Tenant 1──N CampaignPlan 1──N SocialPost
Tenant 1──N PlannerJob
CampaignPlan 1──1 PlannerJob (via plan_id)
```

## State Machines

### CampaignPlan
```
draft → generating → completed
                ↓
              failed
```

### SocialPost
```
draft → approved → scheduled → published
```

### PlannerJob
```
pending → processing → completed
                   ↓
                 failed
```
