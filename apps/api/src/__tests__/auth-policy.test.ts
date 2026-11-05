import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../middleware/rate-limit.middleware.js', () => ({
  checkEmailVerificationRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  checkForgotPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
  checkResetPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
  checkSocialLoginRateLimit: vi.fn(async () => ({ allowed: true, remaining: 30 })),
  checkSetPasswordRateLimit: vi.fn(async () => ({ allowed: true, remaining: 5 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

/**
 * Testes da integração login × política (requisito 6 — evitar over-fetching):
 * a resposta de login e /auth/me devem embutir o estado do aceite
 * ({ currentVersion, accepted }) sem chamada extra do frontend.
 */

const authServiceMock = {
  login: vi.fn(),
  socialAuthService: {},
};
const socialAuthServiceMock = {
  generateSocialLoginUrl: vi.fn(),
  handleGoogleSocialLogin: vi.fn(),
};
const policyServiceMock = {
  getLoginState: vi.fn(),
};

import { AuthController } from '../controllers/auth.controller.js';

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

const next = vi.fn() as NextFunction;

const LOGIN_RESULT = {
  user: { id: 'u1', email: 't@t.test', role: 'owner', tenantId: 't1', name: null },
  tokens: { accessToken: 'at', refreshToken: 'rt' },
};

describe('AuthController × Policy (estado embutido no login)', () => {
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.login.mockResolvedValue(LOGIN_RESULT);
    policyServiceMock.getLoginState.mockResolvedValue({ currentVersion: '1.0', accepted: false });
    controller = new AuthController(
      authServiceMock as any,
      socialAuthServiceMock as any,
      policyServiceMock as any
    );
  });

  it('login: resposta contém policy { currentVersion, accepted }', async () => {
    const req = { body: { email: 't@t.test', password: 'secret' } } as Request;
    const res = createRes();

    await controller.login(req, res, next);

    expect(policyServiceMock.getLoginState).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          token: 'at',
          refreshToken: 'rt',
          policy: { currentVersion: '1.0', accepted: false },
        }),
      })
    );
  });

  it('login: propaga erro quando getLoginState falha (sem engolir)', async () => {
    policyServiceMock.getLoginState.mockRejectedValue(new Error('db down'));
    const req = { body: { email: 't@t.test', password: 'secret' } } as Request;
    const res = createRes();

    await controller.login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'db down' }));
  });

  it('getMe: resposta contém policy', async () => {
    authServiceMock.getMe = vi.fn().mockResolvedValue({
      id: 'u1',
      email: 't@t.test',
      role: 'owner',
      tenantId: 't1',
      tenantName: 'Acme',
      tenantSlug: 'acme',
      tenantCodigo: 'ACM12345',
      businessContext: null,
    });
    const req = { user: { userId: 'u1', tenantId: 't1' } } as Request;
    const res = createRes();

    await controller.getMe(req, res, next);

    expect(policyServiceMock.getLoginState).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          policy: { currentVersion: '1.0', accepted: false },
        }),
      })
    );
  });

  it('social login (POST): resposta contém policy { currentVersion, accepted }', async () => {
    (socialAuthServiceMock.handleGoogleSocialLogin as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokens: { accessToken: 'at', refreshToken: 'rt' },
      user: { id: 'u1', email: 't@t.test', name: 'Test', role: 'owner', tenantId: 't1' },
      isNewUser: true,
    });

    const req = {
      body: { code: 'google-code' },
      method: 'POST',
      query: {},
      get: () => 'localhost:5173',
      protocol: 'http',
    } as unknown as Request;
    const res = createRes();

    await controller.googleSocialCallback(req, res, next);

    expect(policyServiceMock.getLoginState).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          isNewUser: true,
          policy: { currentVersion: '1.0', accepted: false },
        }),
      })
    );
  });
});
