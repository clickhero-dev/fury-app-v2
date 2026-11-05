-- IMPORTANTE: Essa migration só deve rodar DEPOIS que as write paths (Fase 1-3) já estão
-- em produção e confirmadas NÃO gerarem calendar_date NULL.
-- Motivo: se um post for criado entre os dois deploys, ele nasce NULL e viola o constraint.

CREATE INDEX IF NOT EXISTS social_posts_tenant_calendar_date_idx ON social_posts (tenant_id, calendar_date);

ALTER TABLE social_posts ALTER COLUMN calendar_date SET NOT NULL;
