import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgresql://fury:fury_local@localhost:5432/fury_test';
const apiPort = Number(process.env.E2E_API_PORT ?? 3100);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `NODE_ENV=test PORT=${apiPort} DATABASE_URL=${databaseUrl} pnpm --dir ../api exec tsx src/e2e-server.ts`,
      url: `${apiBaseUrl}/health`,
      timeout: 45_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `VITE_API_URL=${apiBaseUrl} pnpm exec vite --host 127.0.0.1 --port ${webPort}`,
      url: webBaseUrl,
      timeout: 45_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
