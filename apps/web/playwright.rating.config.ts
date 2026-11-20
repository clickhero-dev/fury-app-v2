import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5188);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './e2e-mock',
  testMatch: 'studio-rating.spec.ts',
  timeout: 30_000,
  use: { baseURL, ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: {
    command: `VITE_API_URL=http://127.0.0.1:3100/api VITE_POSTHOG_KEY= npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
