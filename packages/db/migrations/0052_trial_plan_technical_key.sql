ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "technical_key" varchar(100);
CREATE UNIQUE INDEX IF NOT EXISTS "plans_technical_key_unique"
  ON "plans" ("technical_key")
  WHERE "technical_key" IS NOT NULL;