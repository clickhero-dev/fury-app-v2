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
    setupFiles: ['./apps/api/src/__tests__/setup.env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      all: true,
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
        '**/setup.env.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
