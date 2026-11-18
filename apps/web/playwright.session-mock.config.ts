import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-mock',
  testMatch: 'session-refresh.spec.ts',
  outputDir: process.env.SESSION_E2E_OUTPUT_DIR ?? './test-results/session-refresh',
  use: { baseURL: 'http://127.0.0.1:5176', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5176 --strictPort',
    env: { VITE_API_URL: 'http://127.0.0.1:3100/api' },
    url: 'http://127.0.0.1:5176',
    timeout: 45_000,
    reuseExistingServer: false,
  },
});
