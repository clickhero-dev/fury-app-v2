CREATE TABLE IF NOT EXISTS "subscription_renewal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
  "previous_period_end" timestamptz NOT NULL,
  "renewed_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_renewal_events_subscription_period_idx"
  ON "subscription_renewal_events" ("subscription_id", "previous_period_end");
CREATE INDEX IF NOT EXISTS "subscription_renewal_events_renewed_at_idx"
  ON "subscription_renewal_events" ("renewed_at");