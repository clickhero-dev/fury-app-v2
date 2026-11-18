-- Frozen, owner-bound reviews. No provider request can precede a durable claim.
CREATE TABLE IF NOT EXISTS chat_approval_reviews (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    version integer NOT NULL DEFAULT 1 CHECK (version = 1),
    digest text NOT NULL,
    snapshot jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_approval_reviews_owner_idx
    ON chat_approval_reviews(tenant_id,user_id,conversation_id,id);

-- Separate from chat_approvals.status: Node must still consume approved ->
-- executing itself. The PK arbitrates batch/single dispatch races.
CREATE TABLE IF NOT EXISTS chat_approval_effects (
    approval_id uuid PRIMARY KEY REFERENCES chat_approvals(id) ON DELETE CASCADE,
    review_id uuid NOT NULL REFERENCES chat_approval_reviews(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    state text NOT NULL CHECK (state IN ('claimed','processing','completed','failed','unknown')),
    result jsonb,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);
