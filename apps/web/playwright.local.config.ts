import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL, ...devices['Desktop Chrome'] },
  webServer: {
    command: `VITE_API_URL=${baseURL}/api pnpm dev --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
  },
});
