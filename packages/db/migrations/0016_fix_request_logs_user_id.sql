ALTER TABLE "request_logs" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "request_logs" ADD COLUMN "user_id" uuid;
