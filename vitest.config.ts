import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    root: process.cwd(),
    globals: true,
    testTimeout: 30000,
    pool: 'forks',
    singleFork: true,
    env: {
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-not-for-production',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-32chars',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});