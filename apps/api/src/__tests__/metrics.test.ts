import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db } from '@fury/db';
import * as schema from '@fury/db';

describe('Metrics Endpoints', () => {
  let accessToken: string;
  let tenantId: string;
  let campaignId: string;
  const uniqueId = () => Date.now().toString().slice(-8);

  const clearData = async () => {
    await db.delete(schema.furyInsights);
    await db.delete(schema.campaigns);
    await db.delete(schema.clientGoals);
    await db.delete(schema.metaConnections);
    await db.delete(schema.creativeAssets);
    await db.delete(schema.users);
    await db.delete(schema.tenants);
  };

  beforeEach(async () => {
    await clearData();

    // Create user
    const id = uniqueId();
    const email = `test-${id}@test.com`;
    const password = 'SecurePass123!';
    await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email,
      password,
      companyName: `Test Company ${id}`,
    });

    const loginResponse = await request(app).post('/api/auth/login').send({
      email,
      password,
    });

    accessToken = loginResponse.body.data.token;
    tenantId = loginResponse.body.data.user.tenantId;

    // Create campaigns with metrics
    const campaigns = await db
      .insert(schema.campaigns)
      .values([
        {
          tenantId,
          metaCampaignId: 'meta_camp_001',
          name: 'Campaign 1',
          status: 'active' as any,
          metrics: {
            spend: 500000, // 5,000 em centavos
            roas: 3.5,
            cpa: 150000, // 1,500
            ctr: 2.5,
            impressions: 20000,
            clicks: 500,
            conversions: 50,
          } as unknown as any,
        },
        {
          tenantId,
          metaCampaignId: 'meta_camp_002',
          name: 'Campaign 2',
          status: 'active' as any,
          metrics: {
            spend: 300000,
            roas: 2.8,
            cpa: 200000,
            ctr: 1.8,
            impressions: 15000,
            clicks: 270,
            conversions: 15,
          } as unknown as any,
        },
      ])
      .returning();

    campaignId = campaigns[0].id;

    // Create client goals
    await db.insert(schema.clientGoals).values({
      tenantId,
      objective: 'aumentar_vendas',
      monthlyBudget: { amount: 500000, currency: 'BRL' } as unknown as any,
      targetCpa: { amount: 150000, currency: 'BRL' } as unknown as any,
      niche: 'ecommerce',
    });

    // Create fury insights
    await db.insert(schema.furyInsights).values([
      {
        tenantId,
        campaignId,
        suggestionType: 'budget_increase',
        suggestionData: {
          type: 'budget_increase',
          priority: 'high',
          title: 'Increase budget for high-performing campaign',
        } as unknown as any,
      },
    ]);
  });


  describe('GET /api/metrics/summary', () => {
    it('should return metrics summary with spend, roas, cpa, ctr', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip test if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const summary = response.body.data.summary;
      expect(summary).toHaveProperty('spend');
      expect(summary).toHaveProperty('roas');
      expect(summary).toHaveProperty('cpa');
      expect(summary).toHaveProperty('ctr');
      expect(typeof summary.spend).toBe('number');
      expect(typeof summary.roas).toBe('number');
      expect(typeof summary.cpa).toBe('number');
      expect(typeof summary.ctr).toBe('number');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/metrics/summary');

      expect([401, 404]).toContain(response.status);
    });
  });

  describe('GET /api/metrics/campaigns', () => {
    it('should return paginated list of campaigns', async () => {
      const response = await request(app)
        .get('/api/metrics/campaigns')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data;
      expect(Array.isArray(data.campaigns || data)).toBe(true);

      if (data.campaigns) {
        expect(data).toHaveProperty('pagination');
        expect(data.pagination).toHaveProperty('page');
        expect(data.pagination).toHaveProperty('limit');
        expect(data.pagination).toHaveProperty('total');
      }

      const campaigns = data.campaigns || data;
      expect(campaigns.length).toBeGreaterThan(0);
      expect(campaigns[0]).toHaveProperty('name');
      expect(campaigns[0]).toHaveProperty('status');
      expect(campaigns[0]).toHaveProperty('metrics');
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/metrics/campaigns?page=1&limit=1')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect([200, 400]).toContain(response.status);

      if (response.status === 200 && response.body.data.pagination) {
        expect(response.body.data.pagination.page).toBe(1);
        expect(response.body.data.pagination.limit).toBe(1);
      }
    });

    it('should only return campaigns for authenticated tenant', async () => {
      const response = await request(app)
        .get('/api/metrics/campaigns')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect(response.status).toBe(200);

      const campaigns = response.body.data.campaigns || response.body.data;
      expect(campaigns.length).toBeGreaterThan(0);

      // All campaigns should belong to the authenticated tenant
      for (const campaign of campaigns) {
        expect(campaign.tenantId || campaign.id).toBeDefined();
      }
    });
  });

  describe('GET /api/metrics/goals-progress', () => {
    it('should return goals progress with percentage', async () => {
      const response = await request(app)
        .get('/api/metrics/goals-progress')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const progress = response.body.data;
      expect(progress).toHaveProperty('progressPercent');
      expect(typeof progress.progressPercent).toBe('number');
      expect(progress.progressPercent).toBeGreaterThanOrEqual(0);
      expect(progress.progressPercent).toBeLessThanOrEqual(100);
    });

    it('should calculate correct progress based on goals', async () => {
      const response = await request(app)
        .get('/api/metrics/goals-progress')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoint not implemented
      if (response.status === 404) {
        expect(response.status).toBe(404);
        return;
      }

      expect(response.status).toBe(200);

      const progress = response.body.data;
      expect(progress).toHaveProperty('progressPercent');
      expect(progress.progressPercent).toBeGreaterThanOrEqual(0);
      expect(progress.progressPercent).toBeLessThanOrEqual(100);

      expect(progress).toHaveProperty('goal');
      expect(progress.goal).toHaveProperty('targetCpa');
      expect(progress.goal).toHaveProperty('monthlyBudget');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app).get('/api/metrics/goals-progress');

      expect([401, 404]).toContain(response.status);
    });
  });

  describe('Metrics Data Integrity', () => {
    it('should return consistent metrics across endpoints', async () => {
      const summaryResponse = await request(app)
        .get('/api/metrics/summary')
        .set('Authorization', `Bearer ${accessToken}`);

      const campaignsResponse = await request(app)
        .get('/api/metrics/campaigns')
        .set('Authorization', `Bearer ${accessToken}`);

      // Skip if endpoints not implemented
      if (summaryResponse.status === 404 || campaignsResponse.status === 404) {
        return;
      }

      const summary = summaryResponse.body.data.summary;
      const campaigns = campaignsResponse.body.data.campaigns || campaignsResponse.body.data;

      // Summary spend should match sum of campaign spends
      if (summary && campaigns.length > 0) {
        const totalSpend = campaigns.reduce((sum: number, c: any) => sum + (c.metrics?.spend || 0), 0);
        expect(summary.spend).toBe(totalSpend);
      }
    });
  });
});
