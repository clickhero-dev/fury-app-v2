CREATE TABLE IF NOT EXISTS chat_plan_run_requests (
  run_id uuid NOT NULL REFERENCES chat_response_runs(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  payload_hash text NOT NULL,
  plan_id uuid NOT NULL REFERENCES chat_plans(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, request_key)
);
