import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: { query: { subscriptions: { findFirst: mockFindFirst } } },
  subscriptions: { tenantId: 'tenant_id' },
}));

import { checkSubscriptionActive } from '/home/diogo/fury-app-v2/apps/api/src/middleware/checkSubscriptionActive.js';

describe('debug', () => {
  it('debug call', async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = { user: { userId: 'user-1', tenantId: 'tenant-1', email: 'x@y.z', role: 'owner' }, tenant: { tenantId: 'tenant-1' } } as any;
    const next = vi.fn();
    await checkSubscriptionActive(req, {} as any, next as any);
    console.log('next calls:', next.mock.calls.length);
    console.log('mockFindFirst calls:', mockFindFirst.mock.calls.length);
    console.log('mockFindFirst args:', JSON.stringify(mockFindFirst.mock.calls));
  });
});
