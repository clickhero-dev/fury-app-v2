import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  it('retorna 403 sem req.user', () => {
    const next = mockNext();
    superadminMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('retorna 403 para role diferente de superadmin', () => {
    const next = mockNext();
    superadminMiddleware(mockReq({ user: { role: 'user' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('permite superadmin', () => {
    const next = mockNext();
    superadminMiddleware(mockReq({ user: { role: 'superadmin' } } as any), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('tenantOrSuperadminMiddleware', () => {
  it('superadmin com query tenantId usa o tenant alvo', () => {
    const req = mockReq({
      user: { role: 'superadmin', tenantId: 't-admin' },
      query: { tenantId: 't-target' },
    } as any);
    const next = mockNext();

    tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-target');
    expect(next).toHaveBeenCalledWith();
  });

  it('superadmin com header x-tenant-id usa o tenant alvo', () => {
    const req = mockReq({
      user: { role: 'superadmin', tenantId: 't-admin' },
      headers: { 'x-tenant-id': 't-header' },
    } as any);
    const next = mockNext();

    tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-header');
    expect(next).toHaveBeenCalledWith();
  });

  it('superadmin sem tenant alvo cai para o próprio tenantId', () => {
    const req = mockReq({ user: { role: 'superadmin', tenantId: 't-admin' } } as any);
    const next = mockNext();

    tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-admin');
    expect(next).toHaveBeenCalledWith();
  });

  it('usuário comum usa o próprio tenantId', () => {
    const req = mockReq({ user: { role: 'user', tenantId: 't-1' } } as any);
    const next = mockNext();

    tenantOrSuperadminMiddleware(req, {} as Response, next);

    expect((req.tenant as any).tenantId).toBe('t-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('retorna 403 sem req.user e sem tenantId', () => {
    const next = mockNext();
    tenantOrSuperadminMiddleware(mockReq(), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }));
  });
});
