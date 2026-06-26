-- Form submission tracking for observability
CREATE TYPE form_submission_status AS ENUM ('PENDING', 'COMPLETED', 'ERROR', 'ABANDONED');

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_type VARCHAR NOT NULL,
  status form_submission_status NOT NULL DEFAULT 'PENDING',
  abandoned_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_form_submissions_tenant_id ON form_submissions(tenant_id);
CREATE INDEX idx_form_submissions_user_id ON form_submissions(user_id);
CREATE INDEX idx_form_submissions_form_type ON form_submissions(form_type);
CREATE INDEX idx_form_submissions_status ON form_submissions(status);
CREATE INDEX idx_form_submissions_tenant_form_type ON form_submissions(tenant_id, form_type);
