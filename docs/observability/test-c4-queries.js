import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'fury_dev',
  user: 'fury',
  password: 'fury_local',
});

const queries = {
  '1. Requests/min (Last 1 hour)': `
SELECT
  COUNT(*) / 60.0 as requests_per_minute,
  COUNT(*) as total_requests,
  COUNT(DISTINCT tenant_id) as active_tenants
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
`,

  '2. Average Latency (Current hour)': `
SELECT
  COALESCE(ROUND(AVG(response_time_ms)::NUMERIC, 1), 0) as avg_latency_ms,
  MIN(response_time_ms) as min_latency,
  MAX(response_time_ms) as max_latency
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
`,

  '3. Error Rate % (Last 1 hour)': `
SELECT
  COALESCE(
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0),
      1
    ),
    0
  ) as error_rate_pct,
  COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
  COUNT(*) as total_requests
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
`,

  '4. 5xx Errors (Last 1 hour)': `
SELECT
  COUNT(*) as server_errors,
  ROUND(
    100.0 * COUNT(*) / NULLIF(
      (SELECT COUNT(*) FROM request_logs WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'),
      0
    ),
    1
  ) as percentage
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
  AND status_code BETWEEN 500 AND 599
`,

  '5. Time Series (Last 1 hour)': `
SELECT
  DATE_TRUNC('minute', created_at)::TIMESTAMP as minute,
  COUNT(*) as requests_per_minute
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute ASC
LIMIT 5
`,

  '6. Heatmap (Last 1 hour)': `
SELECT
  status_code,
  CASE
    WHEN response_time_ms < 100 THEN '0-100ms'
    WHEN response_time_ms < 250 THEN '100-250ms'
    WHEN response_time_ms < 500 THEN '250-500ms'
    WHEN response_time_ms < 1000 THEN '500-1000ms'
    ELSE '1000ms+'
  END as response_time_bucket,
  COUNT(*) as count
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY status_code, response_time_bucket
LIMIT 10
`,

  '7. p50 Latency (Last 15 min)': `
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_time_ms) as p50_latency_ms
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
`,

  '8. p95 Latency (Last 15 min)': `
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency_ms
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
`,

  '9. p99 Latency (Last 15 min)': `
SELECT
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_latency_ms
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
`,

  '10. Top 10 Endpoints (Last 1 hour)': `
SELECT
  path_template as endpoint,
  ROUND(AVG(response_time_ms)::NUMERIC, 2) as avg_latency_ms,
  COUNT(*) as request_count,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency_ms
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
  AND path_template IS NOT NULL
GROUP BY path_template
HAVING COUNT(*) >= 5
ORDER BY avg_latency_ms DESC
LIMIT 10
`,

  '11. 4xx Gauge (Last 1 hour)': `
SELECT
  COALESCE(
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499) / NULLIF(COUNT(*), 0),
      1
    ),
    0
  ) as error_rate_pct,
  COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499) as client_errors,
  COUNT(*) as total_requests
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
`,

  '12. 5xx Gauge (Last 1 hour)': `
SELECT
  COALESCE(
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE status_code BETWEEN 500 AND 599) / NULLIF(COUNT(*), 0),
      1
    ),
    0
  ) as error_rate_pct,
  COUNT(*) FILTER (WHERE status_code BETWEEN 500 AND 599) as server_errors,
  COUNT(*) as total_requests
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
`,

  '13. Top 10 Tenants (Last 24h)': `
SELECT
  tenant_id,
  COUNT(*) as request_count,
  ROUND(AVG(response_time_ms)::NUMERIC, 1) as avg_latency_ms,
  COALESCE(
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0),
      1
    ),
    0
  ) as error_rate_pct
FROM request_logs
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
  AND tenant_id IS NOT NULL
GROUP BY tenant_id
ORDER BY request_count DESC
LIMIT 10
`,
};

async function testQueries() {
  console.log('🔍 C4 QUERY VALIDATION AGAINST fury_dev\n');
  console.log('━'.repeat(70));

  let passed = 0;
  let failed = 0;

  for (const [name, sql] of Object.entries(queries)) {
    try {
      const start = Date.now();
      const result = await pool.query(sql);
      const duration = Date.now() - start;

      console.log(`\n✅ ${name}`);
      console.log(`   Rows: ${result.rows.length} | Time: ${duration}ms`);
      if (result.rows.length > 0) {
        console.log(`   Sample: ${JSON.stringify(result.rows[0]).slice(0, 100)}...`);
      }
      passed++;
    } catch (error) {
      console.log(`\n❌ ${name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'━'.repeat(70)}`);
  console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed (${((passed / (passed + failed)) * 100).toFixed(0)}%)\n`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

testQueries().catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});
