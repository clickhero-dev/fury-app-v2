import { defineConfig } from '@playwright/test';
const port = Number(process.env.STUDIO_E2E_PORT ?? 5194);
export default defineConfig({
  testDir: './e2e-mock',
  testMatch: 'studio-mobile.spec.ts',
  outputDir: './test-results/studio-mobile',
  workers: 1,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-360', use: { viewport: { width: 360, height: 800 }, hasTouch: true } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: `VITE_API_URL=http://127.0.0.1:3100/api VITE_POSTHOG_KEY= npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
