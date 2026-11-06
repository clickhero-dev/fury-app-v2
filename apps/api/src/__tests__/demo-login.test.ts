/*
# Language: pt-BR

Funcionalidade: acesso direto à conta demo

  Cenário: visitante recebe uma sessão demo sem enviar credenciais
    Dado que o tenant fashion-demo e seu usuário estão disponíveis
    Quando solicita o login demo
    Então recebe tokens e o usuário do tenant demo

  Cenário: conta demo indisponível não gera sessão
    Dado que o tenant demo não existe
    Quando solicita o login demo
    Então recebe erro de indisponibilidade e nenhum token
*/
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../services/core/auth.service.js';
import { AppError } from '../middleware/errorHandler.js';

vi.mock('../lib/redis.js', () => ({
  getRedis: vi.fn(() => ({ setex: vi.fn(async () => 'OK'), get: vi.fn(async () => null), del: vi.fn(async () => 1) })),
}));

const demoUser = {
  id: 'demo-user', tenantId: 'demo-tenant', name: 'Fashion Demo', email: 'demo@example.test',
  role: 'owner', createdAt: new Date(), notificationPrefs: {}, audienceDefaults: null,
};

function makeService(repo: any) {
  return new AuthService(() => repo, {
    jwt: { generateAccessToken: vi.fn(() => 'access'), generateRefreshToken: vi.fn(() => 'refresh'), verifyRefreshToken: vi.fn() },
    email: { sendWelcomeEmail: vi.fn(), sendOtpEmail: vi.fn(), sendPasswordResetConfirmation: vi.fn() },
  } as any);
}

describe('BDD: AuthService.demoLogin', () => {
  it('Cenário: visitante recebe uma sessão demo sem enviar credenciais', async () => {
    const repo = {
      findTenantBySlug: vi.fn().mockResolvedValue({ id: 'demo-tenant', slug: 'fashion-demo' }),
      findUserByTenant: vi.fn().mockResolvedValue(demoUser),
      isAccountActive: vi.fn().mockResolvedValue(true),
    };

    const result = await makeService(repo).demoLogin();

    expect(repo.findTenantBySlug).toHaveBeenCalledWith('fashion-demo');
    expect(result.tokens).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(result.user).toEqual(expect.objectContaining({ id: 'demo-user', tenantId: 'demo-tenant' }));
  });

  it('Cenário: conta demo indisponível não gera sessão', async () => {
    const repo = { findTenantBySlug: vi.fn().mockResolvedValue(null) };

    await expect(makeService(repo).demoLogin()).rejects.toMatchObject(
      new AppError(503, 'DEMO_UNAVAILABLE', 'Conta demo indisponível'),
    );
  });
});
