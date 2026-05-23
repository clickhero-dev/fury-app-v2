-- drizzle:disable-transaction
ALTER TYPE "compliance_status" ADD VALUE IF NOT EXISTS 'pending_compliance';
ALTER TABLE "creative_assets" ALTER COLUMN "compliance_status" SET DEFAULT 'pending_compliance';
