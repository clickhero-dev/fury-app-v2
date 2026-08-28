import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../services/core/auth.service.js';

vi.mock('../../lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn(async () => null),
    setex: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  })),
}));

const user = { id: 'u1', tenantId: 't1', name: 'Diogo', email: 'a@b.com', role: 'owner', createdAt: new Date(), notificationPrefs: {}, audienceDefaults: null };

function makeRepo(override: Record<string, any> = {}) {
  return {
    findUserByEmail: vi.fn(async () => null),
    findUserById: vi.fn(async () => user),
    findTenant: vi.fn(async () => null),
    patchUser: vi.fn(async () => undefined),
    patchTenant: vi.fn(async () => undefined),
    findTenantBySlug: vi.fn(async () => null),
    ...override,
  } as any;
}

function makeSvc(repo: any) {
  return new AuthService(
    () => repo,
    {
      jwt: { generateAccessToken: vi.fn(() => 'at'), generateRefreshToken: vi.fn(() => 'rt'), verifyRefreshToken: vi.fn(() => ({ userId: 'u1' })) },
      email: { sendWelcomeEmail: vi.fn(async () => undefined), sendOtpEmail: vi.fn(async () => undefined), sendPasswordResetConfirmation: vi.fn(async () => undefined) },
    } as any,
  );
}

describe('AuthService (deep DI)', () => {
  it('getMe injeta dados do tenant via repo', async () => {
    const repo = makeRepo({ findTenant: vi.fn(async () => ({ name: 'Empresa', slug: 'emp', codigo: 'ABC12345', businessContext: 'restaurante' })) });
    const svc = makeSvc(repo);
    const me = await svc.getMe('u1');
    expect(me.email).toBe('a@b.com');
    expect(me.tenantName).toBe('Empresa');
    expect(me.tenantCodigo).toBe('ABC12345');
    expect(me.businessContext).toBe('restaurante');
  });

  it('login de usuário Google (sem passwordHash) → INVALID_CREDENTIALS', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => ({ ...user, passwordHash: null })) });
    await expect(makeSvc(repo).login({ email: 'a@b.com', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('verifyEmail valida OTP, marca verificado e envia email', async () => {
    const repo = makeRepo({
      findUserByEmail: vi.fn(async () => ({ ...user, otpCode: '123456', otpExpiresAt: new Date(Date.now() + 600000) })),
      findUserById: vi.fn(async () => ({ ...user, emailVerified: true })),
    });
    const svc = makeSvc(repo);
    const dto = await svc.verifyEmail('a@b.com', '123456');
    expect(dto.email).toBe('a@b.com');
    expect(repo.patchUser).toHaveBeenCalled();
    expect((svc as any).deps.email.sendWelcomeEmail).toHaveBeenCalled();
  });
});

describe('AuthService.forgotPassword / resetPassword (recuperação de senha)', () => {
  const resetUser = {
    ...user,
    resetToken: '123456',
    resetTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    otpCode: '999999',
    otpExpiresAt: new Date(Date.now() + 60 * 1000),
  };

  it('forgotPassword gera código de 6 dígitos expirando em ~15min e envia email', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => resetUser) });
    const svc = makeSvc(repo);
    await svc.forgotPassword('a@b.com');

    const[[id, patch]] = repo.patchUser.mock.calls;
    expect(id).toBe('u1');
    expect(patch.resetToken).toMatch(/^\d{6}$/);
    const ttl = (patch.resetTokenExpiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
    expect((svc as any).deps.email.sendOtpEmail).toHaveBeenCalled();
  });

  it('forgotPassword com email inexistente não grava nem envia (silencioso)', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => null) });
    const svc = makeSvc(repo);
    await svc.forgotPassword('nao-existe@a.com');
    expect(repo.patchUser).not.toHaveBeenCalled();
    expect((svc as any).deps.email.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('resetPassword happy: troca senha, invalida código e envia confirmação', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => resetUser) });
    const svc = makeSvc(repo);
    await svc.resetPassword('a@b.com', '123456', 'Novasenha1!');

    const[[id, patch]] = repo.patchUser.mock.calls;
    expect(id).toBe('u1');
    expect(patch.passwordHash).toBeTruthy();
    expect(patch.resetToken).toBeNull();
    expect(patch.resetTokenExpiresAt).toBeNull();
    // não deve tocar os campos de verificação de email
    expect(patch.otpCode).toBeUndefined();
    expect(patch.otpExpiresAt).toBeUndefined();
    expect((svc as any).deps.email.sendPasswordResetConfirmation).toHaveBeenCalled();
  });

  it('resetPassword código errado → INVALID_OR_EXPIRED_OTP', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => resetUser) });
    await expect(makeSvc(repo).resetPassword('a@b.com', '000000', 'Novasenha1!')).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_OTP' });
  });

  it('resetPassword código expirado → INVALID_OR_EXPIRED_OTP', async () => {
    const expired = { ...resetUser, resetTokenExpiresAt: new Date(Date.now() - 1000) };
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => expired) });
    await expect(makeSvc(repo).resetPassword('a@b.com', '123456', 'Novasenha1!')).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_OTP' });
  });

  it('resetPassword sem usuário → INVALID_OR_EXPIRED_OTP', async () => {
    const repo = makeRepo({ findUserByEmail: vi.fn(async () => null) });
    await expect(makeSvc(repo).resetPassword('a@b.com', '123456', 'Novasenha1!')).rejects.toMatchObject({ code: 'INVALID_OR_EXPIRED_OTP' });
  });
});