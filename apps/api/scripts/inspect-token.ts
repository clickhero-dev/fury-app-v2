import postgres from 'postgres';

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

const sql = postgres(connectionString, { max: 1 });

async function main() {
  const conns = await sql`
    SELECT id, "tenantId", "createdAt", "tokenExpiresAt",
           "selectedPageIds", "selectedInstagramAccounts",
           length("accessToken") as token_len,
           (length("accessToken") - length(replace("accessToken", ':', ''))) as colons,
           left("accessToken", 40) as token_head,
           right("accessToken", 8) as token_tail
    FROM meta_connections
    ORDER BY "createdAt" DESC;
  `;
  console.log('=== meta_connections ===');
  console.log(`total: ${conns.length}\n`);
  for (const c of conns) {
    console.log('-----------------------------------');
    console.log('id:', c.id);
    console.log('tenantId:', c.tenantId);
    console.log('createdAt:', c.createdAt);
    console.log('tokenExpiresAt:', c.tokenExpiresAt);
    console.log('token_len:', c.token_len, 'colons:', c.colons);
    console.log('selectedPageIds:', c.selectedPageIds);
    console.log('selectedInstagramAccounts:', c.selectedInstagramAccounts);
    console.log('head:', c.token_head);
    console.log('tail:', c.token_tail);
  }

  const tenants = await sql`
    SELECT id, slug, name FROM tenants ORDER BY "createdAt" DESC;
  `;
  console.log('\n=== tenants ===');
  for (const t of tenants) console.log(`  ${t.id} | ${t.slug} | ${t.name}`);

  const posts = await sql`
    SELECT id, status, "postType", "publishAttempts", "lastPublishError",
           "nextRetryAt", "scheduledAt", caption
    FROM social_posts
    ORDER BY "updatedAt" DESC
    LIMIT 20;
  `;
  console.log('\n=== social_posts (últimos 20) ===');
  for (const p of posts) {
    console.log('-----------------------------------');
    console.log('id:', p.id, '| status:', p.status, '| type:', p.postType, '| attempts:', p.publishAttempts);
    console.log('lastPublishError:', p.lastPublishError);
    console.log('scheduledAt:', p.scheduledAt, '| nextRetryAt:', p.nextRetryAt);
    console.log('caption:', (p.caption ?? '').slice(0, 80));
  }
}

main()
  .catch((e) => {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());