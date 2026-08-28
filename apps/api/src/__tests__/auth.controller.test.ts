import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../controllers/auth.controller.js';

vi.mock('../middleware/rate-limit.middleware.js', () => ({
  checkEmailVerificationRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  checkForgotPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
  checkResetPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const authService = {
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
  verifyEmail: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
};
const socialAuthService = {
  generateSocialLoginUrl: vi.fn(),
  handleGoogleSocialLogin: vi.fn(),
};

const ctrl = new AuthController(authService as any, socialAuthService as any);

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
}

function mockReq(overrides: Record<string, any> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    get: () => undefined,
    ...overrides,
  } as any;
}

beforeEach(() => {
  Object.values(authService).forEach((fn) => (fn as any).mockReset());
  Object.values(socialAuthService).forEach((fn) => (fn as any).mockReset());
});

describe('AuthController.register', () => {
  it('happy path → 201 com user mapeado', async () => {
    authService.register.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', tenantId: 't1' },
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    });
    const req = mockReq({ body: { name: 'Ana', email: 'a@b.com', password: 'SenhaForte1!', companyName: 'ACME' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.register(req, res, next);

    expect(authService.register).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (email) → next com ZodError (400)', async () => {
    const req = mockReq({ body: { name: 'Ana', email: 'not-an-email', password: '12345678', companyName: 'ACME' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.register(req, res, next);

    expect(authService.register).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('body inválido (senha curta) → next com ZodError', async () => {
    const req = mockReq({ body: { name: 'Ana', email: 'a@b.com', password: '123', companyName: 'ACME' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.register(req, res, next);

    expect(authService.register).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.login', () => {
  it('happy path → 200 com token e user', async () => {
    authService.login.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'owner', tenantId: 't1' },
      tokens: { accessToken: 'at', refreshToken: 'rt' },
    });
    const req = mockReq({ body: { email: 'a@b.com', password: '12345678' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.login(req, res, next);

    expect(authService.login).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: 'at', refreshToken: 'rt' }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (email) → next com ZodError', async () => {
    const req = mockReq({ body: { email: 'nope', password: 'x' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.login(req, res, next);

    expect(authService.login).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.refresh', () => {
  it('happy path → 200', async () => {
    authService.refresh.mockResolvedValue({ tokens: { accessToken: 'at', refreshToken: 'rt' } });
    const req = mockReq({ body: { refreshToken: 'rt' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.refresh(req, res, next);

    expect(authService.refresh).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (sem refreshToken) → next com ZodError', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.refresh(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.getMe', () => {
  it('happy path → 200 com usuário', async () => {
    authService.getMe.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    const req = mockReq({ user: { userId: 'u1' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.getMe(req, res, next);

    expect(authService.getMe).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('AuthController.verifyEmail', () => {
  it('happy path → 200 com user', async () => {
    authService.verifyEmail.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Ana', tenantId: 't1' });
    const req = mockReq({ body: { email: 'a@b.com', otp: '123456' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.verifyEmail(req, res, next);

    expect(authService.verifyEmail).toHaveBeenCalledWith('a@b.com', '123456');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (otp não-numérico) → next com ZodError', async () => {
    const req = mockReq({ body: { email: 'a@b.com', otp: 'abc123' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.verifyEmail(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.forgotPassword', () => {
  it('happy path → 200', async () => {
    authService.forgotPassword.mockResolvedValue(undefined);
    const req = mockReq({ body: { email: 'a@b.com' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.forgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (email) → next com ZodError', async () => {
    const req = mockReq({ body: { email: 'x' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.forgotPassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.changePassword', () => {
  it('body inválido (nova senha curta) → next com ZodError', async () => {
    const req = mockReq({ user: { userId: 'u1' }, body: { currentPassword: 'ok', newPassword: '123' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.changePassword(req, res, next);

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('nova senha com 8+ mas sem maiúscula/número/especial → ZodError (política forte)', async () => {
    const req = mockReq({ user: { userId: 'u1' }, body: { currentPassword: 'ok', newPassword: 'abcdefgh' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.changePassword(req, res, next);

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AuthController.resetPassword', () => {
  it('happy path → 200 com user mapeado', async () => {
    authService.resetPassword.mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Ana', tenantId: 't1' });
    const req = mockReq({ body: { email: 'a@b.com', otp: '123456', newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.resetPassword(req, res, next);

    expect(authService.resetPassword).toHaveBeenCalledWith('a@b.com', '123456', 'SenhaForte1!');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('otp não-numérico → ZodError', async () => {
    const req = mockReq({ body: { email: 'a@b.com', otp: 'abc123', newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.resetPassword(req, res, next);

    expect(authService.resetPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('nova senha fraca (8+ sem maiúscula/número/especial) → ZodError', async () => {
    const req = mockReq({ body: { email: 'a@b.com', otp: '123456', newPassword: 'abcdefgh' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.resetPassword(req, res, next);

    expect(authService.resetPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('rate-limit bloqueado → 429 sem chamar service', async () => {
    const { checkResetPasswordRateLimit } = await import('../middleware/rate-limit.middleware.js');
    (checkResetPasswordRateLimit as any).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const req = mockReq({ body: { email: 'a@b.com', otp: '123456', newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.resetPassword(req, res, next);

    expect(authService.resetPassword).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });
});