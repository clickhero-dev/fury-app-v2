import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { probeDatabase } from '../lib/database-probe.js';

const url = process.env.PROBE_E2E_DATABASE_URL;
describe.skipIf(!url)('cancelamento do probe com PostgreSQL real', () => {
  it('cancela consulta longa e permite recuperação do pool', async () => {
    const sql = postgres(url!, { max: 2, prepare: false });
    try {
      await expect(probeDatabase(() => sql.unsafe('SELECT pg_sleep(60) /* fury_probe_e2e */')))
        .rejects.toMatchObject({ code: 'ETIMEDOUT' });
      let running = 1;
      for (let attempt = 0; attempt < 30 && running; attempt++) {
        const rows = await sql`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE state = 'active' AND query LIKE 'SELECT pg_sleep(60) /* fury_probe_e2e */%'`;
        running = rows[0].count;
        if (running) await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(running).toBe(0);
      const rows = await sql`SELECT 1 AS ok`;
      expect(rows[0].ok).toBe(1);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }, 20_000);
});
