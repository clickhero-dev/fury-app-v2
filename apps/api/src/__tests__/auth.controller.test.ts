import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from '../controllers/auth.controller.js';

vi.mock('../middleware/rate-limit.middleware.js', () => ({
  checkEmailVerificationRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })),
  checkForgotPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
  checkResetPasswordRateLimit: vi.fn(async () => ({ allowed: true })),
  checkSocialLoginRateLimit: vi.fn(async () => ({ allowed: true, remaining: 30 })),
  checkSetPasswordRateLimit: vi.fn(async () => ({ allowed: true, remaining: 5 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const authService = {
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
  setInitialPassword: vi.fn(),
  verifyEmail: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
};
const socialAuthService = {
  generateSocialLoginUrl: vi.fn(),
  handleGoogleSocialLogin: vi.fn(),
  generateFacebookLoginUrl: vi.fn(),
  handleFacebookSocialLogin: vi.fn(),
  issueSession: vi.fn(async () => ({ accessToken: 'at', refreshToken: 'rt' })),
  createSocialHandoff: vi.fn(),
  consumeSocialHandoff: vi.fn(),
};

const ctrl = new AuthController(authService as any, socialAuthService as any);

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
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

// Gera um par (state assinado, header Cookie) que passa no anti-CSRF do callback GET.
async function validStateAndCookie(frontendOrigin = 'http://localhost:5173') {
  const jwt = (await import('jsonwebtoken')).default;
  const crypto = (await import('node:crypto')).default;
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign({ frontendUrl: frontendOrigin, nonce }, process.env.JWT_SECRET as string, {
    algorithm: 'HS256',
    expiresIn: '10m',
  });
  return { state, cookie: `social_oauth_nonce=${nonce}` };
}

beforeEach(() => {
  Object.values(authService).forEach((fn) => (fn as any).mockReset());
  Object.values(socialAuthService).forEach((fn) => (fn as any).mockReset());
  socialAuthService.issueSession.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
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

describe('AuthController.facebookSocialUrl', () => {
  it('302 para o Facebook: seta o cookie de nonce e o state não carrega origin fora da allowlist', async () => {
    process.env.ALLOWED_FRONTEND_ORIGINS = 'https://app.exemplo.com';
    socialAuthService.generateFacebookLoginUrl.mockImplementation((_uri: string, state: string) => `https://facebook.com/dialog/oauth?state=${state}`);
    const req = mockReq({ query: { origin: 'https://evil.com' }, get: (h: string) => (h === 'host' ? 'api.local' : undefined), protocol: 'https' });
    const res = mockRes();

    await ctrl.facebookSocialUrl(req, res, vi.fn());

    expect(res.cookie).toHaveBeenCalledWith('social_oauth_nonce', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax' }));
    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain('facebook.com');
    const jwt = (await import('jsonwebtoken')).default;
    const stateJwt = new URL(target).searchParams.get('state')!;
    const decoded = jwt.verify(stateJwt, process.env.JWT_SECRET as string) as any;
    expect(decoded.frontendUrl).not.toContain('evil.com');
    expect(decoded.nonce).toEqual(expect.any(String));
    delete process.env.ALLOWED_FRONTEND_ORIGINS;
  });

  it('rate limit estourado → redirect para /login?error=rate_limited, sem cookie nem chamada ao provedor', async () => {
    const { checkSocialLoginRateLimit } = await import('../middleware/rate-limit.middleware.js');
    (checkSocialLoginRateLimit as any).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const req = mockReq();
    const res = mockRes();

    await ctrl.facebookSocialUrl(req, res, vi.fn());

    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=rate_limited'));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(socialAuthService.generateFacebookLoginUrl).not.toHaveBeenCalled();
  });
});

describe('AuthController.facebookSocialCallback', () => {
  it('GET sem state → redirect social_login_failed (anti-CSRF)', async () => {
    const req = mockReq({ method: 'GET', query: { code: 'valid-code-1234' } });
    const res = mockRes();
    await ctrl.facebookSocialCallback(req, res, vi.fn());
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=social_login_failed'));
    expect(socialAuthService.handleFacebookSocialLogin).not.toHaveBeenCalled();
  });

  it('GET com nonce do cookie divergente do state → social_login_failed', async () => {
    const { state } = await validStateAndCookie();
    const req = mockReq({ method: 'GET', query: { code: 'valid-code-1234', state }, headers: { cookie: 'social_oauth_nonce=diferente' } });
    const res = mockRes();
    await ctrl.facebookSocialCallback(req, res, vi.fn());
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=social_login_failed'));
    expect(socialAuthService.handleFacebookSocialLogin).not.toHaveBeenCalled();
  });

  it('error param (com state+cookie válidos) → redirect oauth_cancelled', async () => {
    const { state, cookie } = await validStateAndCookie();
    const req = mockReq({ method: 'GET', query: { error: 'access_denied', state }, headers: { cookie } });
    const res = mockRes();
    await ctrl.facebookSocialCallback(req, res, vi.fn());
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('error=oauth_cancelled'));
    expect(socialAuthService.handleFacebookSocialLogin).not.toHaveBeenCalled();
  });

  it('GET sucesso → cria handoff (sem tokens) e redireciona SEM token na URL', async () => {
    socialAuthService.handleFacebookSocialLogin.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'owner', tenantId: 't1' },
      isNewUser: false,
    });
    socialAuthService.createSocialHandoff.mockResolvedValue('h'.repeat(64));
    const { state, cookie } = await validStateAndCookie();
    const req = mockReq({ method: 'GET', query: { code: 'valid-code-1234', state }, headers: { cookie } });
    const res = mockRes();

    await ctrl.facebookSocialCallback(req, res, vi.fn());

    // handoff recebe só a identidade, sem tokens
    const handoffArg = socialAuthService.createSocialHandoff.mock.calls[0][0];
    expect(handoffArg).toEqual({ user: expect.objectContaining({ id: 'u1' }), isNewUser: false });
    expect(handoffArg).not.toHaveProperty('token');
    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain('fb_handoff=');
    expect(target).not.toContain('social_login=');
  });

  it('POST sucesso → emite sessão e devolve no corpo (SPA)', async () => {
    socialAuthService.handleFacebookSocialLogin.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'owner', tenantId: 't1' },
      isNewUser: true,
    });
    const req = mockReq({ method: 'POST', body: { code: 'valid-code-1234' } });
    const res = mockRes();

    await ctrl.facebookSocialCallback(req, res, vi.fn());

    expect(socialAuthService.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.token).toBe('at');
    expect(socialAuthService.createSocialHandoff).not.toHaveBeenCalled();
  });

  it('code ausente → 400 MISSING_CODE (POST)', async () => {
    const req = mockReq({ method: 'POST', body: {} });
    const res = mockRes();
    await ctrl.facebookSocialCallback(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('MISSING_CODE');
  });

  it('FACEBOOK_EMAIL_MISSING propaga código e status no POST', async () => {
    const { AppError } = await import('../middleware/errorHandler.js');
    socialAuthService.handleFacebookSocialLogin.mockRejectedValue(
      new AppError(400, 'FACEBOOK_EMAIL_MISSING', 'sem e-mail'),
    );
    const req = mockReq({ method: 'POST', body: { code: 'valid-code-1234' } });
    const res = mockRes();
    await ctrl.facebookSocialCallback(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('FACEBOOK_EMAIL_MISSING');
  });
});

describe('AuthController.setPassword', () => {
  it('happy: chama setInitialPassword e responde 200', async () => {
    authService.setInitialPassword.mockResolvedValue(undefined);
    const req = mockReq({ user: { userId: 'u1' }, body: { newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    await ctrl.setPassword(req, res, vi.fn());
    expect(authService.setInitialPassword).toHaveBeenCalledWith('u1', 'SenhaForte1!');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sem sessão → erro (não chama service)', async () => {
    const req = mockReq({ body: { newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    const next = vi.fn();
    await ctrl.setPassword(req, res, next);
    expect(authService.setInitialPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('senha fraca → ZodError, sem chamar service', async () => {
    const req = mockReq({ user: { userId: 'u1' }, body: { newPassword: '123' } });
    const res = mockRes();
    const next = vi.fn();
    await ctrl.setPassword(req, res, next);
    expect(authService.setInitialPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('rate limit estourado → 429', async () => {
    const { checkSetPasswordRateLimit } = await import('../middleware/rate-limit.middleware.js');
    (checkSetPasswordRateLimit as any).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const req = mockReq({ user: { userId: 'u1' }, body: { newPassword: 'SenhaForte1!' } });
    const res = mockRes();
    const next = vi.fn();
    await ctrl.setPassword(req, res, next);
    expect(authService.setInitialPassword).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });
});

describe('AuthController.socialHandoff', () => {
  it('id inválido → 400', async () => {
    const req = mockReq({ body: { id: 'curto' } });
    const res = mockRes();
    const next = vi.fn();
    await ctrl.socialHandoff(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_HANDOFF_ID' }));
  });

  it('handoff expirado → 401', async () => {
    socialAuthService.consumeSocialHandoff.mockResolvedValue(null);
    const req = mockReq({ body: { id: 'a'.repeat(64) } });
    const res = mockRes();
    const next = vi.fn();
    await ctrl.socialHandoff(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'HANDOFF_EXPIRED' }));
  });

  it('handoff válido → emite sessão fresca e devolve tokens + user', async () => {
    socialAuthService.consumeSocialHandoff.mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', name: 'Ana', role: 'owner', tenantId: 't1' },
      isNewUser: true,
    });
    const req = mockReq({ body: { id: 'b'.repeat(64) } });
    const res = mockRes();
    await ctrl.socialHandoff(req, res, vi.fn());
    expect(socialAuthService.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', tenantId: 't1' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.token).toBe('at');
    expect(res.json.mock.calls[0][0].data.user.id).toBe('u1');
    expect(res.json.mock.calls[0][0].data.isNewUser).toBe(true);
  });
});