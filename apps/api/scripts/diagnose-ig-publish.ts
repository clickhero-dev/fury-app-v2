/**
 * Diagnóstico do fluxo de publicação no Instagram.
 * Testa cada chamada HTTP à Meta passo a passo para o tenant do usuário informado.
 *
 * Uso: DATABASE_URL=... JWT_SECRET=... npx tsx apps/api/scripts/diagnose-ig-publish.ts <email>
 */
import crypto from 'crypto';
import postgres from 'postgres';

const EMAIL = process.argv[2] || 'diogommtdes@gmail.com';
const DATABASE_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function log(step: string, msg: string, data?: unknown) {
  console.log(`\n[${step}] ${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function getAesKey(): Buffer {
  return crypto.createHash('sha256').update(JWT_SECRET).digest();
}

function decryptMetaToken(encryptedPayload: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Formato de token criptografado inválido (esperado iv:authTag:encrypted).');
  }
  const key = getAesKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function metaGet(path: string, token: string) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString());
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  console.log('='.repeat(70));
  console.log(`DIAGNÓSTICO PUBLICAÇÃO INSTAGRAM — ${EMAIL}`);
  console.log(`Meta API: ${META_API_VERSION}`);
  console.log('='.repeat(70));

  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    // 1. Achar usuário + tenant
    const users = await sql`
      SELECT id, email, tenant_id, role FROM users WHERE email = ${EMAIL} LIMIT 1
    `;
    if (users.length === 0) {
      log('DB', `Usuário ${EMAIL} não encontrado.`);
      return;
    }
    const user = users[0];
    log('DB', 'Usuário encontrado', { id: user.id, tenant_id: user.tenant_id, role: user.role });

    // 2. Conexão Meta do tenant
    const conns = await sql`
      SELECT id, meta_user_id, access_token, token_expires_at,
             selected_page_ids, selected_ad_account_id, created_at, updated_at
      FROM meta_connections WHERE tenant_id = ${user.tenant_id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (conns.length === 0) {
      log('DB', 'Nenhuma conexão Meta para este tenant.');
      return;
    }
    const conn = conns[0];
    const expired = conn.token_expires_at && new Date(conn.token_expires_at) < new Date();
    log('DB', 'Conexão Meta encontrada', {
      meta_user_id: conn.meta_user_id,
      token_expires_at: conn.token_expires_at,
      expired_by_date: expired || false,
      selected_page_ids: conn.selected_page_ids,
      token_format_ok: (conn.access_token as string).split(':').length === 3,
    });

    // 3. Descriptografar token
    let token: string;
    try {
      token = decryptMetaToken(conn.access_token as string);
      log('DECRYPT', 'Token descriptografado OK', {
        prefix: token.slice(0, 8),
        length: token.length,
        looks_like_meta: token.startsWith('EAA'),
      });
    } catch (e: any) {
      log('DECRYPT', 'FALHA ao descriptografar — JWT_SECRET local difere do de produção?', { error: e.message });
      return;
    }

    // 4. /me — token válido?
    const me = await metaGet('/me?fields=id,name', token);
    log('STEP 1 /me', me.ok ? 'Token do usuário VÁLIDO' : 'Token INVÁLIDO', me.json);
    if (!me.ok) return;

    // 5. /me/permissions
    const perms = await metaGet('/me/permissions', token);
    const granted = (perms.json as any)?.data?.filter((p: any) => p.status === 'granted').map((p: any) => p.permission) || [];
    const declined = (perms.json as any)?.data?.filter((p: any) => p.status !== 'granted').map((p: any) => p.permission) || [];
    log('STEP 2 /me/permissions', 'Permissões', {
      has_instagram_content_publish: granted.includes('instagram_content_publish'),
      has_pages_show_list: granted.includes('pages_show_list'),
      has_pages_read_engagement: granted.includes('pages_read_engagement'),
      granted,
      declined,
    });

    // 6. /me/accounts com access_token da página (o fix)
    const pages = await metaGet('/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100', token);
    const pageData = (pages.json as any)?.data || [];
    log('STEP 3 /me/accounts', `${pageData.length} páginas`, pageData.map((p: any) => ({
      pageId: p.id,
      name: p.name,
      hasPageToken: Boolean(p.access_token),
      igUserId: p.instagram_business_account?.id ?? null,
      igUsername: p.instagram_business_account?.username ?? null,
    })));

    const pagesWithIg = pageData.filter((p: any) => p.instagram_business_account?.id);
    if (pagesWithIg.length === 0) {
      log('RESULT', 'PROBLEMA: nenhuma página tem Instagram Business vinculado.');
      return;
    }

    // 7. Resolver página (mesma lógica do resolveInstagramAccount)
    const selectedIds: string[] = (conn.selected_page_ids as string[]) || [];
    let chosen = pagesWithIg[0];
    if (selectedIds.length > 0) {
      const sel = pagesWithIg.find((p: any) => selectedIds.includes(p.id));
      if (sel) chosen = sel;
    }
    const pageToken = chosen.access_token;
    const igUserId = chosen.instagram_business_account.id;
    log('STEP 4 resolve', 'Página escolhida', {
      name: chosen.name,
      igUserId,
      usando_page_token: Boolean(pageToken),
    });

    // 8. Testar acesso ao IG user com o PAGE token vs USER token
    const igWithPageToken = await metaGet(`/${igUserId}?fields=id,username`, pageToken || token);
    log('STEP 5 IG (page token)', igWithPageToken.ok ? 'IG acessível com PAGE token' : 'FALHA com PAGE token', igWithPageToken.json);

    const igWithUserToken = await metaGet(`/${igUserId}?fields=id,username`, token);
    log('STEP 5b IG (user token)', igWithUserToken.ok ? 'IG acessível com USER token' : 'FALHA com USER token', igWithUserToken.json);

    // 9. Simular criação de container (dry-run com imagem pública de teste, SEM publicar)
    log('STEP 6', 'Simulação de createInstagramMedia — validando permissão de publicação (dry check via GET de content_publishing_limit)');
    const pubLimit = await metaGet(`/${igUserId}/content_publishing_limit?fields=quota_usage,config`, pageToken || token);
    log('STEP 6 publishing_limit', pubLimit.ok ? 'Quota acessível (permissão OK)' : 'FALHA — provável falta de permissão de publicação', pubLimit.json);

    console.log('\n' + '='.repeat(70));
    console.log('RESUMO');
    console.log('='.repeat(70));
    console.log(`- Token descriptografado: OK`);
    console.log(`- Token válido na Meta: ${me.ok ? 'OK' : 'FALHOU'}`);
    console.log(`- instagram_content_publish: ${granted.includes('instagram_content_publish') ? 'GRANTED' : 'FALTANDO ❌'}`);
    console.log(`- Página com IG: ${pagesWithIg.length > 0 ? 'OK' : 'FALHOU'}`);
    console.log(`- Page token presente: ${pageToken ? 'OK' : 'FALTANDO ❌'}`);
    console.log(`- IG acessível (page token): ${igWithPageToken.ok ? 'OK' : 'FALHOU ❌'}`);
    console.log(`- IG acessível (user token): ${igWithUserToken.ok ? 'OK' : 'FALHOU'}`);
    console.log(`- Publishing limit (permissão publicar): ${pubLimit.ok ? 'OK' : 'FALHOU ❌'}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
