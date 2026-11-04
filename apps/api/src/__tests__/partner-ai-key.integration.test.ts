import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { eq, inArray, sql } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { rbacService } from '../services/core/rbac.service.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { flushRequestLogs } from '../middleware/request-logger.js';
import { runWithTenant, resolveAiKey, clearAiKeyCache } from '../lib/ai-key-context.js';

/**
 * INTEGRAÇÃO (app real + banco de teste + Redis local) — chave de IA do parceiro.
 * Guardada criptografada, nunca devolvida; cada um só mexe na sua; cliente usa a do dono.
 */
describe('Chave de IA do parceiro — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const KEY_A = `sk-or-v1-${'a'.repeat(56)}${id}`;
  const KEY_B = `sk-or-v1-${'b'.repeat(56)}${id}`;
  const tenantIds: string[] = [];
  const partnerIds: string[] = [];
  let superToken: string;
  let tokenA: string;
  let tokenClient: string;
  let partnerA: string;
  let partnerB: string;
  let clientA: string;
  let clientB: string;
  let clientAdy: string;
  let partnerOwnTenant: string;
  const verify = vi.spyOn(openrouterService, 'verifyKey');

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const row = async (partnerId: string) => (await db.select().from(schema.adyPartners).where(eq(schema.adyPartners.id, partnerId)))[0]!;

  async function register(tag: string) {
    const email = `ak-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'AK', email, password, companyName: `AK ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data as { token: string; user: { id: string; tenantId: string } };
  }

  async function newPartner(tag: string) {
    const [p] = await db.insert(schema.adyPartners).values({ name: `AK ${tag} ${id}`, maxTenants: 5 }).returning();
    partnerIds.push(p!.id);
    return p!.id;
  }

  beforeAll(async () => {
    partnerA = await newPartner('A');
    partnerB = await newPartner('B');
    const sup = await register('super');
    await db.update(schema.users).set({ platformRole: 'super_admin' }).where(eq(schema.users.id, sup.user.id));
    superToken = sup.token;

    const acc = await register('partner-a');
    await db.update(schema.users).set({ platformRole: 'admin_partner', partnerId: partnerA }).where(eq(schema.users.id, acc.user.id));
    tokenA = acc.token;
    partnerOwnTenant = acc.user.tenantId;

    const a = await register('cli-a');
    clientA = a.user.tenantId;
    tokenClient = a.token;
    await db.update(schema.tenants).set({ partnerId: partnerA }).where(eq(schema.tenants.id, clientA));
    await db.update(schema.users).set({ platformRole: 'user_partner' }).where(eq(schema.users.id, a.user.id));
    clientB = (await register('cli-b')).user.tenantId;
    await db.update(schema.tenants).set({ partnerId: partnerB }).where(eq(schema.tenants.id, clientB));
    clientAdy = (await register('cli-ady')).user.tenantId;
    await rbacService.bumpVersion();
  });

  afterAll(async () => {
    verify.mockRestore();
    await db.delete(schema.adyRbacAuditLog).where(inArray(schema.adyRbacAuditLog.partnerId, partnerIds));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.adyPartners).where(inArray(schema.adyPartners.id, partnerIds));
    await rbacService.bumpVersion();
  });

  it('parceiro grava a própria chave: criptografada, só os 4 últimos voltam', async () => {
    verify.mockResolvedValue('valid');
    const res = await request(app).put('/api/admin/my-partner/ai-key').set(bearer(tokenA)).send({ key: KEY_A });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ configured: true, last4: KEY_A.slice(-4) });
    expect(JSON.stringify(res.body)).not.toContain(KEY_A);

    const saved = await row(partnerA);
    expect(saved.openrouterKeyEncrypted).toBeTruthy();
    expect(saved.openrouterKeyEncrypted).not.toContain(KEY_A);
    const get = await request(app).get('/api/admin/my-partner/ai-key').set(bearer(tokenA));
    expect(get.body.data).toEqual({ configured: true, last4: KEY_A.slice(-4) });

    const [log] = await db.select().from(schema.adyRbacAuditLog).where(eq(schema.adyRbacAuditLog.partnerId, partnerA));
    expect(log).toMatchObject({ action: 'ai_key_set' });
    expect(JSON.stringify(log)).not.toContain(KEY_A);
  });

  it('chave inválida ou provedor fora do ar: não grava e não repete a chave', async () => {
    for (const [result, status] of [['invalid', 422], ['unavailable', 503]] as const) {
      verify.mockResolvedValue(result);
      const res = await request(app).put('/api/admin/my-partner/ai-key').set(bearer(tokenA)).send({ key: KEY_B });
      expect(res.status).toBe(status);
      expect(JSON.stringify(res.body)).not.toContain(KEY_B);
    }
    const bad = await request(app).put('/api/admin/my-partner/ai-key').set(bearer(tokenA)).send({ key: 'nao-e-chave-secreta-123' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain('nao-e-chave-secreta-123');
    expect((await row(partnerA)).openrouterKeyLast4).toBe(KEY_A.slice(-4));
  });

  it('isolamento: parceiro não mexe na chave de outro; cliente não mexe em nada', async () => {
    for (const method of ['get', 'put', 'delete'] as const) {
      expect((await request(app)[method](`/api/admin/partners/${partnerB}/ai-key`).set(bearer(tokenA)).send({ key: KEY_B })).status).toBe(403);
      expect((await request(app)[method]('/api/admin/my-partner/ai-key').set(bearer(tokenClient)).send({ key: KEY_B })).status).toBe(403);
    }
    expect((await row(partnerB)).openrouterKeyLast4).toBeNull();
    expect((await request(app).get('/api/admin/my-partner/ai-key').set(bearer(superToken))).status).toBe(404);
  });

  it('super só vê se o parceiro tem chave; não cadastra nem remove', async () => {
    const get = await request(app).get(`/api/admin/partners/${partnerA}/ai-key`).set(bearer(superToken));
    expect(get.body.data).toEqual({ configured: true, last4: KEY_A.slice(-4) });
    expect((await request(app).get('/api/admin/partners/nao-e-uuid/ai-key').set(bearer(superToken))).status).toBe(404);

    verify.mockResolvedValue('valid');
    expect((await request(app).put(`/api/admin/partners/${partnerB}/ai-key`).set(bearer(superToken)).send({ key: KEY_B })).status).toBe(404);
    expect((await request(app).delete(`/api/admin/partners/${partnerA}/ai-key`).set(bearer(superToken))).status).toBe(404);
    expect((await row(partnerB)).openrouterKeyLast4).toBeNull();
    expect((await row(partnerA)).openrouterKeyLast4).toBe(KEY_A.slice(-4));
  });

  it('cada um com a sua chave: parceiro (conta própria e clientes) nunca usa a da ady', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-chave-da-ady');
    const keyOf = (tenantId: string) => runWithTenant(tenantId, () => resolveAiKey());
    clearAiKeyCache();

    // parceiro A com chave: clientes e a conta própria usam a dele
    expect((await keyOf(clientA)).key).toBe(KEY_A);
    expect((await keyOf(partnerOwnTenant)).key).toBe(KEY_A);
    // parceiro B sem chave: bloqueia
    await expect(keyOf(clientB)).rejects.toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE' });
    // cliente ady direto: chave da ady
    expect((await keyOf(clientAdy)).key).toBe('sk-or-chave-da-ady');
    // sem cliente no contexto: erro (nunca cai na chave da ady)
    await expect(resolveAiKey()).rejects.toMatchObject({ code: 'AI_CONTEXT_MISSING' });

    // parceiro remove a própria chave: vale na hora, inclusive para a conta dele
    expect((await request(app).delete('/api/admin/my-partner/ai-key').set(bearer(tokenA))).body.data).toEqual({ configured: false, last4: null });
    await expect(keyOf(clientA)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await expect(keyOf(partnerOwnTenant)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    vi.unstubAllEnvs();
  });

  it('parceiro excluído: clientes ficam sem IA mesmo com chave gravada', async () => {
    verify.mockResolvedValue('valid');
    expect((await request(app).put('/api/admin/my-partner/ai-key').set(bearer(tokenA)).send({ key: KEY_A })).status).toBe(200);
    await db.update(schema.adyPartners).set({ deletedAt: new Date() }).where(eq(schema.adyPartners.id, partnerA));
    clearAiKeyCache();
    await expect(runWithTenant(clientA, () => resolveAiKey())).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await db.update(schema.adyPartners).set({ deletedAt: null }).where(eq(schema.adyPartners.id, partnerA));
  });

  it('conta do parceiro sem vínculo (parceiro apagado no banco) fica sem IA', async () => {
    const [own] = await db.select().from(schema.users).where(eq(schema.users.tenantId, partnerOwnTenant));
    await db.update(schema.users).set({ partnerId: null }).where(eq(schema.users.id, own!.id));
    clearAiKeyCache();
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-chave-da-ady');
    await expect(runWithTenant(partnerOwnTenant, () => resolveAiKey())).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    vi.unstubAllEnvs();
    await db.update(schema.users).set({ partnerId: partnerA }).where(eq(schema.users.id, own!.id));
  });

  it('JSON quebrado na rota da chave: 400 sem ecoar o conteúdo', async () => {
    const res = await request(app).put('/api/admin/my-partner/ai-key').set(bearer(tokenA))
      .set('Content-Type', 'application/json').send(`{"key":"${KEY_B}"`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toContain(KEY_B);
  });

  it('corpo da requisição da chave nunca vai para o log de requisições', async () => {
    await flushRequestLogs();
    const rows = (await db.execute(sql`
      SELECT request_body FROM request_logs
      WHERE path LIKE '%/ai-key%' AND created_at > now() - interval '10 minutes'
    `)) as unknown as Array<{ request_body: unknown }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.request_body === null)).toBe(true);
    const leaked = (await db.execute(sql`SELECT 1 FROM request_logs WHERE request_body::text LIKE ${'%' + KEY_A.slice(-16) + '%'}`)) as unknown as unknown[];
    expect(leaked).toHaveLength(0);
  });
});
