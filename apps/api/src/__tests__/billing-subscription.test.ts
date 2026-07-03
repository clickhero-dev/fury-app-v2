import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: { query: { subscriptions: { findFirst: mockFindFirst } } },
  subscriptions: { tenantId: 'tenant_id' },
}));

import { checkSubscriptionActive } from '../middleware/checkSubscriptionActive.js';

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'test@fury.test', role: 'owner' },
    tenant: { tenantId: 'tenant-1' },
    ...overrides,
  } as Request;
}

function createNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('checkSubscriptionActive middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passa quando não existe subscription', async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('retorna 401 quando não há tenantId', async () => {
    const req = createMockRequest({ user: undefined, tenant: undefined });
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('bloqueia subscription cancelled (403)', async () => {
    mockFindFirst.mockResolvedValue({ status: 'cancelled', trialEndsAt: null, currentPeriodEnd: null });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('bloqueia subscription inactive (403)', async () => {
    mockFindFirst.mockResolvedValue({ status: 'inactive', trialEndsAt: null, currentPeriodEnd: null });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('bloqueia subscription past_due (403)', async () => {
    mockFindFirst.mockResolvedValue({ status: 'past_due', trialEndsAt: null, currentPeriodEnd: null });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('bloqueia trial expirado (403 TRIAL_EXPIRED)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    mockFindFirst.mockResolvedValue({ status: 'trial', trialEndsAt: pastDate, currentPeriodEnd: null });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TRIAL_EXPIRED');
  });

  it('passa quando trial ainda válido', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindFirst.mockResolvedValue({ status: 'trial', trialEndsAt: futureDate, currentPeriodEnd: null });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('bloqueia active com período vencido (403)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    mockFindFirst.mockResolvedValue({ status: 'active', trialEndsAt: null, currentPeriodEnd: pastDate });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('passa quando active com período vigente', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindFirst.mockResolvedValue({ status: 'active', trialEndsAt: null, currentPeriodEnd: futureDate });
    const req = createMockRequest();
    const next = createNext();

    await checkSubscriptionActive(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
