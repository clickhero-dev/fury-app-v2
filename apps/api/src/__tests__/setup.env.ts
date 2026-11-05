// ponytail: env stub for test runner — modules que chamam requireEnv() no top-level
// precisam destas vars senão o import falha antes do teste rodar.
process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-characters-long-aaaa';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-min-32-chars-aaaa';
process.env.TOKEN_ENCRYPTION_KEY ??= 'test-token-encryption-key-32-chars!!';
process.env.TEST_DATABASE_URL ??= 'postgresql://fury:fury_local@localhost:5432/fury_test';
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL;
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.NODE_ENV ??= 'test';

// Integration suites create tenants through the real signup route. The
// production contract intentionally requires an administrator-configured
// Trial plan, so CI seeds only the isolated test database with that fixture.
// Unit tests keep their lightweight setup when the committed placeholder URL
// is in use.
if (process.env.TEST_DATABASE_URL && !process.env.TEST_DATABASE_URL.includes('***')) {
  try {
    const { db, plans } = await import('@fury/db');
    await db.insert(plans).values({
      name: 'Trial de teste',
      technicalKey: 'trial_new_signup',
      priceCents: 0,
      interval: 'monthly',
      features: {},
      limits: { creativesPerMonth: 5 },
      isActive: true,
    }).onConflictDoNothing();
  } catch {
    // The test harness can still run unit-only files without Postgres.
  }
}