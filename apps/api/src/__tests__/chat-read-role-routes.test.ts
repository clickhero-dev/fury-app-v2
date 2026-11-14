import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  subscriptions: new Map<string, unknown>(),
  reads: [] as string[],
  find: vi.fn(async (_tenant: string): Promise<unknown> => null),
}));
vi.mock('../repository/subscription.repository.js', () => ({
  SubscriptionRepository: class {
    constructor(private tenant: string) {}
    findSubscription() { return state.find(this.tenant); }
    async getCreativeQuotaSnapshot() { state.reads.push(`image:${this.tenant}`); return {creativesLimit: 5, creativesRemaining: 2}; }
  },
}));
vi.mock('../repository/meta.repository.js', () => ({ MetaRepository: class {} }));
vi.mock('../services/studio/studio-video.service.js', () => ({
  StudioVideoService: class {
    async getOptions(tenant: string) { state.reads.push(`video:${tenant}`); return {videosLimit: 3, videosRemaining: 1}; }
  },
}));

import { createChatReadRouter } from '../routes/chat-read.routes.js';
import { createChatReadCapabilities } from '../services/chat/chat-read-runtime.js';
import { createDelegationGuard } from '../middleware/chat-delegation.middleware.js';
import { createRbacMiddleware } from '../middleware/rbac.middleware.js';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { generateAccessToken } from '../lib/jwt.js';
import { errorHandler } from '../middleware/errorHandler.js';

const secret = '01234567890123456789012345678901';
const credential = (tenantId: string, role: string) => createChatDelegation({userId: `user-${tenantId}`, tenantId, email: 'a@example.com', role}, secret);
const activePastEnd = {status:'active', isNonExpirable:true, currentPeriodEnd:new Date(0)};
const expiredTrial = {status:'trial', trialEndsAt:new Date(0)};
const activeResult = {subscription:'active', images:{limit:5, remaining:2}, videos:{limit:3, remaining:1}};
const expiredResult = {subscription:'expired', images:null, videos:null};

function setup() {
  state.subscriptions.clear(); state.reads.length = 0;
  state.find.mockReset().mockImplementation(async tenant => state.subscriptions.get(tenant) ?? null);
  const rbac = {checkServices: vi.fn(async () => 'allowed' as const)};
  const app = express();
  app.use('/api', createDelegationGuard({secret, repository:()=>({} as any)}), createRbacMiddleware(rbac), createChatReadRouter(createChatReadCapabilities, rbac));
  app.use(errorHandler);
  return {app, rbac};
}

describe('chat quota route authenticated role', () => {
  it('also uses the role from a normal signed access token and ignores spoofed headers', async () => {
    const {app} = setup();
    state.subscriptions.set('ordinary-tenant', activePastEnd);
    const accessToken = generateAccessToken({userId:'normal-user', tenantId:'ordinary-tenant', email:'a@example.com', role:'owner'});
    const res = await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${accessToken}`).set('X-Role', 'demo').set('X-Tenant-Id', 'demo-tenant');
    expect(res.status).toBe(200); expect(res.body.data).toEqual(expiredResult);
    expect(state.find).toHaveBeenCalledWith('ordinary-tenant'); expect(state.reads).toEqual([]);
  });

  it('does not create a runtime for unauthenticated, tenantless, or RBAC-blocked requests', async () => {
    const factory = vi.fn(createChatReadCapabilities);
    const rbac = {checkServices: vi.fn(async (): Promise<'allowed' | 'blocked'> => 'blocked')};
    const app = express();
    app.use('/api', createDelegationGuard({secret, repository:()=>({} as any)}), createRbacMiddleware(rbac), createChatReadRouter(factory, rbac));
    app.use(errorHandler);
    expect((await request(app).get('/api/studio/chat-quotas')).status).toBe(401);
    expect((await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('demo-tenant', 'demo')}`)).status).toBe(403);
    rbac.checkServices.mockResolvedValue('allowed');
    const tenantless = generateAccessToken({userId:'user', tenantId:'', email:'a@example.com', role:'demo'});
    expect((await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${tenantless}`)).status).toBe(403);
    expect(factory).not.toHaveBeenCalled();
  });
  it('uses the authenticated demo role while ordinary users remain expired', async () => {
    const {app} = setup();
    state.subscriptions.set('demo-tenant', activePastEnd);
    state.subscriptions.set('ordinary-tenant', activePastEnd);
    const demo = await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('demo-tenant', 'demo')}`);
    const ordinary = await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('ordinary-tenant', 'owner')}`);
    expect(demo.status).toBe(200); expect(demo.body.data).toEqual(activeResult);
    expect(ordinary.status).toBe(200); expect(ordinary.body.data).toEqual(expiredResult);
    expect(state.reads).toEqual(['image:demo-tenant', 'video:demo-tenant']);
  });

  it('isolates concurrent mixed roles and tenants even when repository reads overlap', async () => {
    const {app} = setup();
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    state.find.mockImplementation(async () => { if (++arrivals === 2) release(); await barrier; return activePastEnd; });
    const [demo, ordinary] = await Promise.all([
      request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('demo-tenant', 'demo')}`),
      request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('ordinary-tenant', 'owner')}`),
    ]);
    expect(demo.status).toBe(200); expect(demo.body.data).toEqual(activeResult);
    expect(ordinary.status).toBe(200); expect(ordinary.body.data).toEqual(expiredResult);
    expect(state.reads).toEqual(['image:demo-tenant', 'video:demo-tenant']);
    expect(state.find.mock.calls.map(([tenant]) => tenant).sort()).toEqual(['demo-tenant','ordinary-tenant']);
  });

  it('does not exempt an expired demo trial', async () => {
    const {app} = setup(); state.subscriptions.set('demo-tenant', expiredTrial);
    const res = await request(app).get('/api/studio/chat-quotas').set('Authorization', `Bearer ${credential('demo-tenant', 'demo')}`);
    expect(res.status).toBe(200); expect(res.body.data).toEqual(expiredResult); expect(state.reads).toEqual([]);
  });
});
