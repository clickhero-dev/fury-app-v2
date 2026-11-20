-- Tickets are opaque, short-lived and atomically consumed across chat instances.
CREATE TABLE IF NOT EXISTS chat_websocket_tickets (
    ticket_hash bytea PRIMARY KEY,
    assertion text NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_websocket_tickets_expires_at_idx
    ON chat_websocket_tickets (expires_at);
