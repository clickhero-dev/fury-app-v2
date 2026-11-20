import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-mock', testMatch: 'studio-template-integrated.spec.ts', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5197', ...devices['Desktop Chrome'] },
  webServer: [
    { command: 'TOKEN_ENCRYPTION_KEY=test-token-encryption-key-32chars NODE_ENV=test ../../node_modules/.bin/tsx ../api/src/__tests__/template-integrated-server.ts', url: 'http://127.0.0.1:3197/__fixture/stats', reuseExistingServer: false, timeout: 45000 },
    { command: 'VITE_API_URL=http://127.0.0.1:3197/api VITE_POSTHOG_KEY= ./node_modules/.bin/vite --host 127.0.0.1 --port 5197 --strictPort', url: 'http://127.0.0.1:5197', reuseExistingServer: false, timeout: 45000 },
  ],
});
