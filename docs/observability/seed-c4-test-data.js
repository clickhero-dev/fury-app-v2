import pkg from 'pg';
const { Pool } = pkg;
import { randomUUID } from 'crypto';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fury_dev',
  user: 'fury',
  password: 'fury_local',
});

async function seedTestData() {
  console.log('📝 Seeding test data for C4 validation...\n');

  const tenantIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];

  const pathTemplates = [
    '/api/campaigns/:id',
    '/api/studios/:id',
    '/api/metrics/kpis',
    '/api/dashboard',
    '/api/auth/login',
    '/api/invoices/:id',
    '/api/subscriptions',
    '/api/forms/:id',
    '/api/health',
    '/api/instagram/sync',
  ];

  const statusCodes = [200, 201, 204, 400, 401, 403, 404, 500, 502, 503];

  // Generate 100 requests in the last hour
  let insertCount = 0;

  for (let i = 0; i < 100; i++) {
    const minutesAgo = Math.floor(Math.random() * 60);
    const createdAt = new Date(Date.now() - minutesAgo * 60 * 1000);
    const tenantId = tenantIds[Math.floor(Math.random() * tenantIds.length)];
    const pathTemplate = pathTemplates[Math.floor(Math.random() * pathTemplates.length)];
    const statusCode = statusCodes[Math.floor(Math.random() * statusCodes.length)];
    const responseTimeMs = Math.floor(Math.random() * 2000) + 10; // 10-2010ms

    try {
      await pool.query(
        `INSERT INTO request_logs
         (created_at, request_id, tenant_id, method, path, path_template, status_code, response_time_ms, ip_address, user_agent, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          createdAt,
          randomUUID(),
          tenantId,
          ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)],
          pathTemplate.replace(':id', randomUUID()),
          pathTemplate,
          statusCode,
          responseTimeMs,
          `192.168.1.${Math.floor(Math.random() * 255)}`,
          'Mozilla/5.0 (Chrome)',
          randomUUID(),
        ]
      );
      insertCount++;
    } catch (error) {
      console.error(`Insert error: ${error.message}`);
    }
  }

  console.log(`✅ Inserted ${insertCount} test records\n`);

  // Now test the queries
  const queries = {
    'Requests/min': `
      SELECT COUNT(*) / 60.0 as rpm FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `,
    'Avg Latency': `
      SELECT ROUND(AVG(response_time_ms)::NUMERIC, 1) as avg_ms
      FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `,
    'Error Rate': `
      SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0), 1) as error_pct
      FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `,
    '5xx Count': `
      SELECT COUNT(*) as server_errors FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      AND status_code BETWEEN 500 AND 599
    `,
    'Top Endpoints': `
      SELECT path_template, COUNT(*) as count, ROUND(AVG(response_time_ms)::NUMERIC, 1) as avg_ms
      FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      AND path_template IS NOT NULL
      GROUP BY path_template
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
      LIMIT 5
    `,
    'p50 Latency': `
      SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) as p50
      FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    `,
    'Top Tenants': `
      SELECT tenant_id, COUNT(*) as count FROM request_logs
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
      AND tenant_id IS NOT NULL
      GROUP BY tenant_id
      ORDER BY count DESC
      LIMIT 3
    `,
  };

  console.log('━'.repeat(70));
  console.log('📊 QUERY RESULTS WITH TEST DATA\n');

  for (const [name, sql] of Object.entries(queries)) {
    try {
      const result = await pool.query(sql);
      console.log(`✅ ${name}`);
      console.log(`   ${JSON.stringify(result.rows, null, 2)}`);
      console.log();
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}\n`);
    }
  }

  await pool.end();
  console.log('✅ Validation complete!');
}

seedTestData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
