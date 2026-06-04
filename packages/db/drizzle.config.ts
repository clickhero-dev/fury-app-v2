import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev',
  },
  verbose: true,
  strict: false,
} satisfies Config;
