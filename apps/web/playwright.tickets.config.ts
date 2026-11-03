import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-mock',
  fullyParallel: false,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'VITE_API_URL=http://127.0.0.1:3100/api pnpm exec vite --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
  },
});
