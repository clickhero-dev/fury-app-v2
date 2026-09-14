import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Testes do PolicyController (glue HTTP fino, service injetado — DI).
 * Baseline de endpoints: happy path, 400 (body inválido), 401 (sem auth
 * é tratado pelo middleware, coberto no teste de rotas), 409 (versão stale).
 */

const serviceMock = {
  getCurrentForUser: vi.fn(),
  getLoginState: vi.fn(),
  accept: vi.fn(),
};

import { PolicyController } from '../controllers/policy.controller.js';

function createRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 't@t.test', role: 'owner' },
    ...overrides,
  } as Request;
}

const next = vi.fn() as NextFunction;

describe('PolicyController', () => {
  let controller: PolicyController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new PolicyController(serviceMock as any);
  });

  describe('getCurrent', () => {
    it('retorna 200 com estado da política (happy path)', async () => {
      serviceMock.getCurrentForUser.mockResolvedValue({
        currentVersion: '1.0',
        currentVersionId: 'v1',
        accepted: false,
        content: 'texto',
      });
      const req = createReq();
      const res = createRes();

      await controller.getCurrent(req, res, next);

      expect(serviceMock.getCurrentForUser).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: false, content: 'texto' },
        })
      );
    });

    it('chama next(error) quando o service lança', async () => {
      serviceMock.getCurrentForUser.mockRejectedValue(new Error('boom'));
      const req = createReq({ user: undefined });
      const res = createRes();

      await controller.getCurrent(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('retorna 200 com estado atualizado (happy path)', async () => {
      serviceMock.accept.mockResolvedValue({ accepted: true, currentVersion: '1.0' });
      const req = createReq({ body: { versionId: '11111111-1111-4111-8111-111111111111' } });
      const res = createRes();

      await controller.accept(req, res, next);

      expect(serviceMock.accept).toHaveBeenCalledWith('tenant-1', 'user-1', '11111111-1111-4111-8111-111111111111');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { accepted: true, currentVersion: '1.0' },
        })
      );
    });

    it('retorna 400 quando o body é inválido (versionId ausente)', async () => {
      const req = createReq({ body: {} });
      const res = createRes();

      await controller.accept(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
      expect(serviceMock.accept).not.toHaveBeenCalled();
    });

    it('propaga 409 POLICY_VERSION_STALE via next', async () => {
      serviceMock.accept.mockRejectedValue(
        Object.assign(new Error('stale'), { statusCode: 409, code: 'POLICY_VERSION_STALE' })
      );
      const req = createReq({ body: { versionId: '22222222-2222-4222-8222-222222222222' } });
      const res = createRes();

      await controller.accept(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409, code: 'POLICY_VERSION_STALE' })
      );
    });
  });
});
