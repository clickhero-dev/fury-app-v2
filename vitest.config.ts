import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    root: process.cwd(),
    globals: true,
    testTimeout: 30000,
    pool: 'forks',
    fileParallelism: false,
    env: {
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-not-for-production',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-32chars',
    },
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
      // O alias usado pelo frontend pertence ao workspace web; apontar para
      // ./src na raiz fazia os testes importar um caminho inexistente.
      '@': path.resolve(__dirname, './apps/web/src'),
    },
  },
});
