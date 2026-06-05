ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "selected_ad_account_id" varchar(255);
