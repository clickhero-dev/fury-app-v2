ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "selected_business_ids" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "selected_page_ids" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "selected_ad_account_ids" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "meta_connections"
  ADD COLUMN IF NOT EXISTS "selected_whatsapp_number_ids" jsonb DEFAULT '[]'::jsonb;
