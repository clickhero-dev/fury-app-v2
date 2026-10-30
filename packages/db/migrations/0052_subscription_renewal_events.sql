CREATE TABLE IF NOT EXISTS "subscription_renewal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "previous_period_end" timestamp with time zone NOT NULL,
  "renewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subscription_renewal_events_subscription_period_unique" UNIQUE("subscription_id", "previous_period_end")
);
CREATE INDEX IF NOT EXISTS "subscription_renewal_events_renewed_at_idx" ON "subscription_renewal_events" ("renewed_at");
