import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';

/**
 * INTEGRAÇÃO — um cliente nunca grava nem lê dados de outro.
 */
describe('Isolamento entre clientes — integração', () => {
  const id = Date.now().toString().slice(-8);
  const password = 'SecurePass123!';
  const tenantIds: string[] = [];
  let a: { token: string; user: { id: string; tenantId: string } };
  let b: { token: string; user: { id: string; tenantId: string } };

  async function register(tag: string) {
    const email = `ti-${tag}-${id}@test.com`;
    await request(app).post('/api/auth/register').send({ name: 'TI', email, password, companyName: `TI ${tag} ${id}` });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    tenantIds.push(res.body.data.user.tenantId);
    return res.body.data;
  }

  let planId: string;

  beforeAll(async () => {
    a = await register('a');
    b = await register('b');
    const [plan] = await db.insert(schema.plans).values({ name: `TI plano ${id}`, priceCents: 100 }).returning();
    planId = plan!.id;
    await db.insert(schema.subscriptions).values({ tenantId: a.user.tenantId, planId, status: 'active', isNonExpirable: true });
  });

  afterAll(async () => {
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
    await db.delete(schema.plans).where(eq(schema.plans.id, planId));
  });

  it('/forms/start ignora tenantId e userId do corpo', async () => {
    const res = await request(app)
      .post('/api/forms/start')
      .set({ Authorization: `Bearer ${a.token}` })
      .send({ tenantId: b.user.tenantId, userId: b.user.id, formType: 'onboarding' });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.id, res.body.data.id));
    expect(row?.tenantId).toBe(a.user.tenantId);
    expect(row?.userId).toBe(a.user.id);
  });

  it('diagnóstico de storage não é público nem liberado a cliente', async () => {
    expect((await request(app).get('/api/studio/storage-check')).status).toBe(401);
    expect((await request(app).get('/api/studio/storage-check').set({ Authorization: `Bearer ${a.token}` })).status).toBe(403);
  });

  it('KPIs da plataforma não são liberados a cliente', async () => {
    expect((await request(app).get('/api/observability/kpis').set({ Authorization: `Bearer ${a.token}` })).status).not.toBe(200);
  });
});
