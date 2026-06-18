import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://admin:***@localhost:5444/fury_dev',
  },
  verbose: true,
  strict: false,
} satisfies Config;
