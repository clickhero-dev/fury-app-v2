CREATE TABLE IF NOT EXISTS "request_logs" (
  "id" bigserial PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "request_id" uuid NOT NULL,
  "tenant_id" uuid,
  "user_id" bigint,
  "method" varchar(10) NOT NULL,
  "path" varchar(500) NOT NULL,
  "path_template" varchar(500),
  "status_code" smallint NOT NULL,
  "response_time_ms" integer NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "request_headers" jsonb,
  "request_body" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_tenant_created" ON "request_logs" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_status_created" ON "request_logs" ("status_code", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_request_logs_request_id" ON "request_logs" ("request_id");
