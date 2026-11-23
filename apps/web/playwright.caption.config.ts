import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-mock', testMatch: 'planner-caption.spec.ts', timeout: 30_000,
  outputDir: '/tmp/fury-caption-e2e', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5198', ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: { command: 'VITE_API_URL=http://127.0.0.1:3100/api npm exec vite -- --host 127.0.0.1 --port 5198 --strictPort', url: 'http://127.0.0.1:5198', reuseExistingServer: false, timeout: 45_000 },
});
