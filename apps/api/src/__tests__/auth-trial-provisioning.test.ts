import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Funcionalidade: acesso automático ao Trial
 * Cenário: cadastro manual de uma nova conta
 * Dado que o e-mail ainda não está cadastrado, quando a pessoa cria uma conta,
 * Então a nova conta recebe uma assinatura Trial automaticamente.
 */
const { databaseMock } = vi.hoisted(() => {
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => [{ id: values.slug ? 'tenant-1' : 'user-1', ...values }]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  };
  return {
    databaseMock: {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock('@fury/db', () => ({
  db: databaseMock,
  tenants: { id: 'tenants.id' },
  users: { id: 'users.id' },
  brandKits: {},
  clientGoals: {},
  metaConnections: {},
  businessProfileSettings: {},
  plans: {},
  subscriptions: {},
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})), and: vi.fn(() => ({})), ne: vi.fn(() => ({})) }));
vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({ setex: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) }),
}));

import { AuthService } from '../services/core/auth.service.js';

function makeService(existingUser: unknown = null) {
  const repo = {
    findUserByEmail: vi.fn(async () => existingUser),
    findTenantBySlug: vi.fn(async () => null),
    provisionDefaultTrial: vi.fn(async () => undefined),
  };
  const service = new AuthService(
    () => repo as never,
    {
      jwt: {
        generateAccessToken: vi.fn(() => 'access'),
        generateRefreshToken: vi.fn(() => 'refresh'),
        verifyRefreshToken: vi.fn(),
      },
      email: {
        sendWelcomeEmail: vi.fn(),
        sendOtpEmail: vi.fn(),
        sendPasswordResetConfirmation: vi.fn(),
      },
    } as never,
  );
  return { service, repo };
}

describe('AuthService.register — Trial automático', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria o Trial para uma nova conta após criar tenant e usuário', async () => {
    const { service, repo } = makeService();

    const result = await service.register({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'SecurePass123!',
      companyName: 'Empresa Ana',
    });

    expect(result.user.tenantId).toBe('tenant-1');
    expect(repo.provisionDefaultTrial).toHaveBeenCalledOnce();
    expect(databaseMock.transaction).toHaveBeenCalledOnce();
  });

  it('não cria trial nem nova conta quando o e-mail já existe', async () => {
    const { service, repo } = makeService({ id: 'existing-user' });

    await expect(service.register({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'SecurePass123!',
      companyName: 'Empresa Ana',
    })).rejects.toMatchObject({ code: 'EMAIL_EXISTS' });

    expect(repo.provisionDefaultTrial).not.toHaveBeenCalled();
    expect(databaseMock.transaction).not.toHaveBeenCalled();
  });
});
