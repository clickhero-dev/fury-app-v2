CREATE TABLE IF NOT EXISTS "request_logs" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "request_id" uuid,
  "tenant_id" uuid,
  "user_id" uuid,
  "method" varchar(10) NOT NULL,
  "path" text NOT NULL,
  "query_string" text,
  "status_code" smallint NOT NULL,
  "response_time_ms" integer NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "referer" text,
  "request_headers" jsonb,
  "request_body" jsonb,
  "response_body" jsonb,
  "error_message" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_tenant_created" ON "request_logs" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_status_created" ON "request_logs" ("status_code", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_request_id" ON "request_logs" ("request_id");
