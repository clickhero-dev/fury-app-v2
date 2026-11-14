import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'n1-studio-reference-photos.spec.ts',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5175', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'VITE_API_URL=http://127.0.0.1:5175/api node_modules/.bin/vite --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
  },
});
