INSERT INTO automation_rules (tenant_id, name, trigger, rule_type, threshold, action, is_active, enabled)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'test rule', 'test_trigger', 'test_type', 100, 'pause', true, 'true')
RETURNING id, name, trigger;
