import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { checkSubscriptionActive } from '../middleware/checkSubscriptionActive.js';

const { mockFindFirst } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
}));

vi.mock('@fury/db', () => ({
  db: { query: { subscriptions: { findFirst: mockFindFirst } } },
  subscriptions: { tenantId: 'tenant_id' },
}));

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'test@fury.test', role: 'member' },
    tenant: { tenantId: 'tenant-1' },
    ...overrides,
  } as Request;
}

function createNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('Onboarding with Subscription Check Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Admin accessing onboarding with expired subscription', () => {
    it('admin com subscription cancelled deve passar (isento)', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'cancelled',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const adminReq = createMockRequest({
        user: {
          userId: 'admin-user-1',
          tenantId: 'tenant-1',
          email: 'admin@company.com',
          role: 'admin',
        },
      });
      const next = createNext();

      await checkSubscriptionActive(adminReq, {} as Response, next);

      // Admin deve passar SEM fazer query ao DB
      expect(next).toHaveBeenCalledWith();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('superadmin com subscription cancelled deve passar (isento)', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'cancelled',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const superadminReq = createMockRequest({
        user: {
          userId: 'superadmin-user-1',
          tenantId: 'tenant-1',
          email: 'superadmin@platform.com',
          role: 'superadmin',
        },
      });
      const next = createNext();

      await checkSubscriptionActive(superadminReq, {} as Response, next);

      // Superadmin deve passar SEM fazer query ao DB
      expect(next).toHaveBeenCalledWith();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it('member com subscription cancelled deve ser bloqueado com erro 403', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'cancelled',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const memberReq = createMockRequest({
        user: {
          userId: 'member-user-1',
          tenantId: 'tenant-1',
          email: 'member@company.com',
          role: 'member',
        },
      });
      const next = createNext();

      await checkSubscriptionActive(memberReq, {} as Response, next);

      // Member deve ser bloqueado
      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
    });
  });

  describe('Subscription status transitions', () => {
    it('subscription com status past_due deve retornar 403 para member', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'past_due',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
    });

    it('subscription com status inactive deve retornar 403 para member', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'inactive',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
    });

    it('trial expirado deve retornar 403 com código TRIAL_EXPIRED para member', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // 1 dia atrás

      mockFindFirst.mockResolvedValue({
        status: 'trial',
        isNonExpirable: false,
        trialEndsAt: pastDate,
        currentPeriodEnd: null,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('TRIAL_EXPIRED');
    });

    it('subscription active com período expirado deve retornar 403 para member', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // 1 dia atrás

      mockFindFirst.mockResolvedValue({
        status: 'active',
        isNonExpirable: false,
        trialEndsAt: null,
        currentPeriodEnd: pastDate,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
    });
  });

  describe('Non-expirable subscriptions', () => {
    it('non-expirable subscription com status active deve passar', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'active',
        isNonExpirable: true,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('non-expirable subscription com status cancelled deve retornar 403', async () => {
      mockFindFirst.mockResolvedValue({
        status: 'cancelled',
        isNonExpirable: true,
        trialEndsAt: null,
        currentPeriodEnd: null,
      });

      const req = createMockRequest();
      const next = createNext();

      await checkSubscriptionActive(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('SUBSCRIPTION_EXPIRED');
    });
  });
});
