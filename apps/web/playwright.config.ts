import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://fury:fury_local@localhost:5432/fury_test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `NODE_ENV=test PORT=3100 DATABASE_URL=${databaseUrl} pnpm --dir ../api exec tsx src/e2e-server.ts`,
      url: 'http://127.0.0.1:3100/api/health',
      timeout: 45_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'VITE_API_URL=http://127.0.0.1:3100/api pnpm dev -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      timeout: 45_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
