ALTER TYPE "compliance_status" ADD VALUE IF NOT EXISTS 'pending_compliance';
--> statement-breakpoint
ALTER TABLE "creative_assets"
  ALTER COLUMN "compliance_status" SET DEFAULT 'pending_compliance';