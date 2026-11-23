import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CHAT_E2E_WEB_URL ?? 'http://127.0.0.1:5175';
const port = new URL(baseURL).port || '5175';

export default defineConfig({
  testDir: './e2e-mock',
  testMatch: 'chat*.spec.ts',
  outputDir: process.env.CHAT_E2E_OUTPUT_DIR ?? './test-results/chatbot',
  fullyParallel: false,
  timeout: 45_000,
  reporter: 'list',
  use: {
    baseURL,
    // Fixture URLs must never reach external services during this gate.
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CHAT_E2E_EXTERNAL_SERVER === '1' ? undefined : {
    command: `pnpm exec vite --config ../../scripts/ci/chatbot-vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    env: { VITE_API_URL: process.env.VITE_API_URL ?? 'http://127.0.0.1:3100/api' },
    url: baseURL,
    timeout: 45_000,
    reuseExistingServer: false,
  },
});
