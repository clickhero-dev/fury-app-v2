// =============================================================================
// TDD (RED→GREEN) — claim de publicação (publish-now / corrida com scheduler).
// Comportamento esperado do PlannerRepository:
//   - claimPostForPublish: UPDATE condicional → status 'publishing' + lease
//     (nextRetryAt = agora + 5 min). Ganha quem está em approved/failed OU
//     publishing com lease vencido. Perde quem está publishing "fresco" ou
//     published. Retorna true só se o UPDATE efetivamente pegou a linha.
//   - setPostRetry: volta status p/ 'approved' (post que perdeu o claim volta
//     pro pool elegível do retry).
//   - listDuePosts: inclui publishing com lease vencido.
// Mocks capturam as expressões do WHERE (padrão workflow-job-recovery).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  gt: (col: unknown, val: unknown) => ({ op: 'gt', col, val }),
  gte: (col: unknown, val: unknown) => ({ op: 'gte', col, val }),
  lt: (col: unknown, val: unknown) => ({ op: 'lt', col, val }),
  lte: (col: unknown, val: unknown) => ({ op: 'lte', col, val }),
  isNull: (col: unknown) => ({ op: 'isNull', col }),
  not: (arg: unknown) => ({ op: 'not', arg }),
  inArray: (col: unknown, vals: unknown[]) => ({ op: 'inArray', col, vals }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  sql: Object.assign((strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals }), {}),
}));

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      socialPosts: { findMany: vi.fn(), findFirst: vi.fn() },
      campaignPlans: { findFirst: vi.fn(), findMany: vi.fn() },
      metaConnections: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
      users: { findFirst: vi.fn(), findMany: vi.fn() },
      brandKits: { findFirst: vi.fn() },
      clientGoals: { findFirst: vi.fn() },
      businessProfileSettings: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaignPlans: { id: 'campaign_plans.id', tenantId: 'campaign_plans.tenant_id', createdAt: 'campaign_plans.created_at' },
  socialPosts: {
    id: 'social_posts.id',
    tenantId: 'social_posts.tenant_id',
    planId: 'social_posts.plan_id',
    status: 'social_posts.status',
    nextRetryAt: 'social_posts.next_retry_at',
    scheduledAt: 'social_posts.scheduled_at',
    publishAttempts: 'social_posts.publish_attempts',
    lastPublishError: 'social_posts.last_publish_error',
    calendarDate: 'social_posts.calendar_date',
    postType: 'social_posts.post_type',
  },
  metaConnections: { tenantId: 'meta_connections.tenant_id', createdAt: 'meta_connections.created_at', tokenExpiresAt: 'meta_connections.token_expires_at' },
  brandKits: { tenantId: 'brand_kits.tenant_id' },
  clientGoals: { id: 'client_goals.id', tenantId: 'client_goals.tenant_id' },
  tenants: { id: 'tenants.id', tenantId: 'tenants.tenant_id' },
  users: { tenantId: 'users.tenant_id' },
  businessProfileSettings: { tenantId: 'business_profile_settings.tenant_id' },
}));

import { PlannerRepository } from '../repository/planner.repository.js';

type Node = { op?: string; col?: unknown; val?: unknown; vals?: unknown[]; args?: Node[]; arg?: unknown };

function find(node: Node, pred: (n: Node) => boolean): Node | null {
  if (pred(node)) return node;
  for (const child of node.args ?? []) {
    const hit = find(child, pred);
    if (hit) return hit;
  }
  if (node.arg && typeof node.arg === 'object') {
    const hit = find(node.arg as Node, pred);
    if (hit) return hit;
  }
  return null;
}

const SOCIAL = 'social_posts.status';

let repo: PlannerRepository;
let returningRows: Array<{ id: string }>;
let capturedSet: Record<string, unknown> | null;
let capturedWhere: Node | null;

beforeEach(() => {
  returningRows = [{ id: 'post-1' }];
  capturedSet = null;
  capturedWhere = null;

  dbMock.update.mockImplementation(() => ({
    set: vi.fn((s: Record<string, unknown>) => {
      capturedSet = s;
      return {
        where: vi.fn((w: Node) => {
          capturedWhere = w;
          return {
            returning: vi.fn(async () => returningRows),
          };
        }),
      };
    }),
  }));

  dbMock.query.socialPosts.findMany.mockImplementation(async (opts: { where?: Node }) => {
    capturedWhere = opts.where ?? null;
    return [];
  });

  repo = new PlannerRepository('tenant-1', dbMock as never);
});

describe('PlannerRepository.claimPostForPublish', () => {
  it('Cenário: claim ganho (linha em approved) → true, status publishing, lease +5min', async () => {
    const res = await repo.claimPostForPublish('post-1');
    expect(res).toBe(true);
    expect(capturedSet?.status).toBe('publishing');
    const lease = capturedSet?.nextRetryAt as Date;
    expect(lease.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);
    expect(lease.getTime()).toBeLessThanOrEqual(Date.now() + 6 * 60_000);
  });

  it('Cenário: claim perdido (UPDATE não pegou linha) → false', async () => {
    returningRows = [];
    expect(await repo.claimPostForPublish('post-1')).toBe(false);
  });

  it('Cenário: WHERE do claim inclui approved|failed OU publishing com lease vencido', async () => {
    await repo.claimPostForPublish('post-1');

    // escopo: id + tenant
    const eqs = ((capturedWhere as Node)?.args ?? []).filter((n) => n.op === 'eq');
    expect(eqs.some((n) => n.val === 'post-1')).toBe(true);
    expect(eqs.some((n) => n.col === 'social_posts.tenant_id')).toBe(true);

    // bloco de elegibilidade
    const inArr = find(capturedWhere as Node, (n) => n.op === 'inArray');
    expect(inArr?.vals).toEqual(expect.arrayContaining(['approved', 'failed']));

    const orNode = find(capturedWhere as Node, (n) => n.op === 'or' && (n.args ?? []).some((a) => a.op === 'and'));
    expect(orNode).not.toBeNull();
    // and(publishing, lte(nextRetryAt, agora))
    const andPub = orNode!.args!.find((a) => a.op === 'and');
    expect(find(andPub as Node, (n) => n.op === 'eq' && n.val === 'publishing')).not.toBeNull();
    expect(find(andPub as Node, (n) => n.op === 'lte' && n.col === 'social_posts.next_retry_at')).not.toBeNull();
  });
});

describe('PlannerRepository.setPostRetry (pós-claim)', () => {
  it('Cenário: retry volta o post p/ approved (nunca fica preso em publishing)', async () => {
    await repo.setPostRetry('post-1', 1, 'erro', new Date(), new Date());
    expect(capturedSet?.status).toBe('approved');
    expect(capturedSet?.lastPublishError).toBe('erro');
    expect(capturedSet?.publishAttempts).toBe(1);
  });
});

describe('PlannerRepository.listDuePosts (lease vencido volta a ser elegível)', () => {
  it('Cenário: WHERE inclui approved (retry vencido/nulo) OU publishing vencido', async () => {
    await repo.listDuePosts(new Date());

    // approved presente dentro do or de statuses
    const orNode = find(capturedWhere as Node, (n) => n.op === 'or' && (n.args ?? []).some((a) => a.op === 'and'));
    expect(orNode).not.toBeNull();
    expect(find(capturedWhere as Node, (n) => n.op === 'eq' && n.col === SOCIAL && n.val === 'approved')).not.toBeNull();
    expect(find(capturedWhere as Node, (n) => n.op === 'eq' && n.col === SOCIAL && n.val === 'publishing')).not.toBeNull();
    // nextRetryAt <= agora presente (2x: branch approved e branch publishing)
    const ltes = [];
    const walk = (n: Node) => {
      if (n.op === 'lte' && n.col === 'social_posts.next_retry_at') ltes.push(n);
      (n.args ?? []).forEach(walk);
      if (n.arg && typeof n.arg === 'object') walk(n.arg as Node);
    };
    walk(capturedWhere as Node);
    expect(ltes.length).toBeGreaterThanOrEqual(2);
  });
});
