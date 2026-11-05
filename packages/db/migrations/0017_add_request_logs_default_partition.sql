-- Create default partition for request_logs (required for inserts to work)
CREATE TABLE IF NOT EXISTS request_logs_default PARTITION OF request_logs DEFAULT;
