import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5174', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'VITE_API_URL=http://127.0.0.1:5174/api pnpm dev --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
  },
});
