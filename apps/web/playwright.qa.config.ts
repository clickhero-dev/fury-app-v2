import { defineConfig, devices } from '@playwright/test';

// QA da jornada real: dados reais, sem mocks, uma execução por vez
const baseURL = process.env.QA_BASE_URL ?? 'http://localhost:5173';
const apiURL = process.env.QA_API_URL ?? 'http://localhost:3000/api';

export default defineConfig({
  testDir: './e2e-qa',
  outputDir: './test-results-qa',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  reporter: [['list'], ['html', { outputFolder: './playwright-report-qa', open: 'never' }]],
  use: {
    baseURL,
    // sem trace/vídeo: gravariam a senha digitada
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // no CI sobe o front da branch apontando para a API do hmg
  webServer: process.env.CI
    ? {
        command: `VITE_API_URL=${apiURL} pnpm dev --host 127.0.0.1 --port ${new URL(baseURL).port} --strictPort`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: false,
      }
    : undefined,
});
