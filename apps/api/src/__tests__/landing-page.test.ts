import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db, tenants, brandKits } from '@fury/db';

describe('Landing Page (public)', () => {
  const uniqueId = () => Date.now().toString().slice(-8);

  const clearData = async () => {
    await db.delete(brandKits);
    await db.delete(tenants);
  };

  beforeEach(async () => {
    await clearData();
  });

  it('GET /api/public/brand-kit/:tenantId → 404 for unknown tenant', async () => {
    const res = await request(app).get('/api/public/brand-kit/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Tenant não encontrado');
  });

  it('GET /api/public/brand-kit/:tenantId → 200 with tenant data (no brand kit)', async () => {
    const id = uniqueId();
    const [tenant] = await db.insert(tenants).values({ name: `Company ${id}`, slug: `company-${id}` }).returning();

    const res = await request(app).get(`/api/public/brand-kit/${tenant.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenantName).toBe(`Company ${id}`);
    expect(res.body.data.logo_url).toBeNull();
    expect(res.body.data.whatsapp_number).toBeNull();
    expect(res.body.data.primary_color).toBe('#E8631A');
  });

  it('GET /api/public/brand-kit/:tenantId → 200 with full brand kit data', async () => {
    const id = uniqueId();
    const [tenant] = await db.insert(tenants).values({ name: `Loja ${id}`, slug: `loja-${id}` }).returning();
    await db.insert(brandKits).values({
      tenantId: tenant.id,
      logoUrl: 'https://r2.example.com/logo.png',
      primaryColor: '#FF0000',
      secondaryColor: '#00FF00',
      whatsappNumber: '5511999999999',
    });

    const res = await request(app).get(`/api/public/brand-kit/${tenant.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      tenantName: `Loja ${id}`,
      logo_url: 'https://r2.example.com/logo.png',
      whatsapp_number: '5511999999999',
      primary_color: '#FF0000',
      secondary_color: '#00FF00',
    });
  });
});
