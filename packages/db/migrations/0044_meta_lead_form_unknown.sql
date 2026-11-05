-- `false` era o default para campanhas novas e impedia a primeira verificação
-- do formulário. Nulo representa desconhecido; true/false passam a ser resultado verificado.
ALTER TABLE "meta_campaign_snapshots"
  ALTER COLUMN "has_lead_form" DROP DEFAULT,
  ALTER COLUMN "has_lead_form" DROP NOT NULL;

-- Runs anteriores podiam persistir o default false sem consultar os anúncios.
UPDATE "meta_campaign_snapshots"
SET "has_lead_form" = NULL
WHERE "has_lead_form" = false;
