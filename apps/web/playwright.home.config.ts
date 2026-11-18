import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.HOME_E2E_PORT ?? 5196);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e-mock',
  testMatch: 'home.spec.ts',
  outputDir: './test-results-qa/home',
  timeout: 30_000,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL,
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite --config ../../scripts/ci/chatbot-vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_API_URL: 'http://127.0.0.1:3100/api', VITE_POSTHOG_KEY: '' },
    url: baseURL,
    reuseExistingServer: false,
  },
});
