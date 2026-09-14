// ponytail: env stub for test runner — modules que chamam requireEnv() no top-level
// precisam destas vars senão o import falha antes do teste rodar.
process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-characters-long-aaaa';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-min-32-chars-aaaa';
process.env.TOKEN_ENCRYPTION_KEY ??= 'test-token-encryption-key-32-chars!!';
process.env.TEST_DATABASE_URL ??= 'postgresql://fury:fury_local@localhost:5432/fury_test';
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.NODE_ENV ??= 'test';