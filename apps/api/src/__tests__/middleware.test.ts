import { describe, it, expect, vi, beforeEach } from 'vitest';
const { getPlatformRole } = vi.hoisted(() => ({ getPlatformRole: vi.fn(async (_id: string): Promise<string | null> => 'user') }));
vi.mock('../services/core/rbac.service.js', () => ({ rbacService: { getPlatformRole } }));
import type { Request, Response, NextFunction } from 'express';

// auth.middleware importa verifyAccessToken de ../lib/jwt.js — isolamos aqui.
const verifyAccessToken = vi.fn();

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
}));

import { authMiddleware, authSSEMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { superadminMiddleware } from '../middleware/superadmin.middleware.js';
import { tenantOrSuperadminMiddleware } from '../middleware/tenantOrSuperadmin.middleware.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, query: {}, ...overrides } as Request;
}

function mockNext(): NextFunction & ReturnType<typeof vi.fn> {
  return vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTH_BYPASS_DEV;
});

describe('authMiddleware', () => {
  it('retorna 401 quando header Authorization está ausente', () => {
    const next = mockNext();
    authMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
  });

  it('retorna 401 quando header não começa com "Bearer "', () => {
    const next = mockNext();
    authMiddleware(mockReq({ headers: { authorization: 'Basic abc' } }), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('injeta req.user e chama next() com token válido', () => {
    verifyAccessToken.mockReturnValue({
      userId: 'u-1',
      tenantId: 't-1',
      email: 'a@b.com',
      role: 'user',
    });
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const next = mockNext();

    authMiddleware(req, {} as Response, next);

    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual({ userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'user' });
    expect(next).toHaveBeenCalledWith();
  });

  it('propaga erro do jwt via next quando token é inválido', () => {
    const jwtError = new Error('jwt expired');
    verifyAccessToken.mockImplementation(() => {
      throw jwtError;
    });
    const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
    const next = mockNext();

    authMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith(jwtError);
  });
});

describe('authSSEMiddleware', () => {
  it('retorna 401 sem token no query nem header', () => {
    const next = mockNext();
    authSSEMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('aceita token via query string', () => {
    verifyAccessToken.mockReturnValue({ userId: 'u-1', tenantId: 't-1', email: 'a@b.com', role: 'user' });
    const req = mockReq({ query: { token: 'query-token' } });
    const next = mockNext();

    authSSEMiddleware(req, {} as Response, next);

    expect(verifyAccessToken).toHaveBeenCalledWith('query-token');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('tenantMiddleware', () => {
  it('retorna 403 quando req.user está ausente', () => {
    const next = mockNext();
    tenantMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
  });

  it('retorna 403 quando req.user não tem tenantId', () => {
    const next = mockNext();
    tenantMiddleware(mockReq({ user: { userId: 'u-1' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('injeta req.tenant a partir do tenantId do user autenticado', () => {
    const req = mockReq({ user: { userId: 'u-1', tenantId: 't-1' } } as any);
    const next = mockNext();

    tenantMiddleware(req, {} as Response, next);

    expect(req.tenant).toEqual({ tenantId: 't-1' });
    expect(next).toHaveBeenCalledWith();
  });
});

describe('superadminMiddleware', () => {
  it('retorna 403 sem req.user', async () => {
    const next = mockNext();
    await superadminMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('retorna 403 para platform_role diferente de super_admin', async () => {
    const next = mockNext();
    await superadminMiddleware(mockReq({ user: { userId: 'u1', role: 'superadmin' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('permite platform_role super_admin', async () => {
    getPlatformRole.mockResolvedValueOnce('super_admin');
    const next = mockNext();
    await superadminMiddleware(mockReq({ user: { userId: 'u1', role: 'owner' } } as any), {} as Response, next);
    expect(getPlatformRole).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledWith();
  });

  it('admin_partner não entra nas rotas de superadmin', async () => {
    getPlatformRole.mockResolvedValueOnce('admin_partner');
    const next = mockNext();
    await superadminMiddleware(mockReq({ user: { userId: 'u1', role: 'owner' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('falha ao ler o papel bloqueia com 503', async () => {
    getPlatformRole.mockRejectedValueOnce(new Error('db down'));
    const next = mockNext();
    await superadminMiddleware(mockReq({ user: { userId: 'u1', role: 'owner' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });
});

describe('tenantOrSuperadminMiddleware', () => {
  it('superadmin com query tenantId usa o tenant alvo', async () => {
    getPlatformRole.mockResolvedValueOnce('super_admin');
    const req = mockReq({
      user: { userId: 'u1', role: 'owner', tenantId: 't-admin' },
      query: { tenantId: '11111111-1111-4111-8111-111111111111' },
    } as any);
    const next = mockNext();

    await tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('11111111-1111-4111-8111-111111111111');
    expect(next).toHaveBeenCalledWith();
  });

  it('superadmin com header x-tenant-id usa o tenant alvo', async () => {
    getPlatformRole.mockResolvedValueOnce('super_admin');
    const req = mockReq({
      user: { userId: 'u1', role: 'owner', tenantId: 't-admin' },
      headers: { 'x-tenant-id': '22222222-2222-4222-8222-222222222222' },
    } as any);
    const next = mockNext();

    await tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('22222222-2222-4222-8222-222222222222');
    expect(next).toHaveBeenCalledWith();
  });

  it('superadmin sem tenant alvo cai para o próprio tenantId', async () => {
    const req = mockReq({ user: { role: 'superadmin', tenantId: 't-admin' } } as any);
    const next = mockNext();

    await tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-admin');
    expect(next).toHaveBeenCalledWith();
  });

  it('usuário comum usa o próprio tenantId', async () => {
    const req = mockReq({ user: { role: 'user', tenantId: 't-1' } } as any);
    const next = mockNext();

    await tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('retorna 403 sem req.user e sem tenantId', async () => {
    const next = mockNext();
    await tenantOrSuperadminMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
  });

  it('JWT com role superadmin sem platform_role super_admin não troca de tenant', async () => {
    const req = mockReq({
      user: { userId: 'u1', role: 'superadmin', tenantId: 't-1' },
      query: { tenantId: '11111111-1111-4111-8111-111111111111' },
    } as any);
    const next = mockNext();

    await tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-1');
  });

  it('tenant alvo que não é UUID em string é ignorado', async () => {
    getPlatformRole.mockResolvedValue('super_admin');
    for (const tenantId of [['11111111-1111-4111-8111-111111111111'], 'abc', { x: 1 }]) {
      const req = mockReq({ user: { userId: 'u1', role: 'owner', tenantId: 't-admin' }, query: { tenantId } } as any);
      await tenantOrSuperadminMiddleware(req, {} as Response, mockNext());
      expect((req.tenant as any).tenantId).toBe('t-admin');
    }
    getPlatformRole.mockResolvedValue('user');
  });
});
