import { defineConfig } from 'vitest/config';
import path from 'path';

const TEST_DB_USER = 'admin';
const TEST_DB_PASS = String.raw`Q7stF0...KdtT`;
const TEST_DB_HOST = 'localhost:5444';
const TEST_DB_NAME = 'fury_test';
const TEST_DB_URL = `postgresql://${TEST_DB_USER}:***@${TEST_DB_HOST}/${TEST_DB_NAME}`;

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    define: {
      'process.env.META_USE_MOCK': JSON.stringify('true'),
      'process.env.NODE_ENV': JSON.stringify('test'),
      'process.env.TEST_DATABASE_URL': JSON.stringify(TEST_DB_URL),
      'process.env.DATABASE_URL': JSON.stringify(TEST_DB_URL),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@fury/db': path.resolve(__dirname, '../../packages/db/src'),
      '@fury/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
