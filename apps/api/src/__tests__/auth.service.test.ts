import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../services/core/auth.service.js';

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