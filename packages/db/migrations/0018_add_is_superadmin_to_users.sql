ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_superadmin" boolean DEFAULT false NOT NULL;
