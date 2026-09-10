import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Testes do PolicyService (comportamento, com repo injetado — DI).
 * Cobre: getCurrentForUser (fail-open), accept (idempotente),
 * versão inexistente (400) e shape do DTO.
 */

const repoMock = {
  getCurrentPolicyWithAcceptance: vi.fn(),
  findUserAcceptanceOfVersion: vi.fn(),
  createAcceptance: vi.fn(),
};

import { PolicyService } from '../services/policy/policy.service.js';

describe('PolicyService', () => {
  let service: PolicyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PolicyService(repoMock as any);
  });

  describe('getCurrentForUser', () => {
    it('retorna versão vigente com accepted=false quando usuário não aceitou', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: { id: 'v1', version: '1.0', content: 'texto' },
        accepted: false,
      });

      const result = await service.getCurrentForUser('u1');

      expect(result).toEqual({
        currentVersion: '1.0',
        currentVersionId: 'v1',
        accepted: false,
        content: 'texto',
      });
    });

    it('retorna accepted=true quando usuário já aceitou a vigente', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: { id: 'v1', version: '1.0', content: 'texto' },
        accepted: true,
      });

      const result = await service.getCurrentForUser('u1');

      expect(result.accepted).toBe(true);
    });

    it('fail-open: sem versão vigente, accepted=true e campos nulos (não bloqueia)', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: undefined,
        accepted: true,
      });

      const result = await service.getCurrentForUser('u1');

      expect(result).toEqual({
        currentVersion: null,
        currentVersionId: null,
        accepted: true,
        content: null,
      });
    });
  });

  describe('getLoginState', () => {
    it('retorna apenas { currentVersion, accepted } (payload enxuto p/ login)', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: { id: 'v1', version: '1.0' },
        accepted: false,
      });

      const result = await service.getLoginState('u1');

      expect(result).toEqual({ currentVersion: '1.0', accepted: false });
      expect(repoMock.getCurrentPolicyWithAcceptance).toHaveBeenCalledWith('u1');
    });
  });

  describe('accept', () => {
    it('grava aceite da versão informada e retorna estado atualizado', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValueOnce({
        currentVersion: { id: 'v1', version: '1.0', content: 'texto' },
        accepted: false,
      });
      repoMock.createAcceptance.mockResolvedValue({ id: 'a1' });

      const result = await service.accept('tenant-1', 'u1', 'v1');

      expect(repoMock.createAcceptance).toHaveBeenCalledWith('u1', 'v1');
      expect(result).toEqual({ accepted: true, currentVersion: '1.0' });
    });

    it('lança 400 quando a versão não existe', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: undefined,
        accepted: true,
      });

      await expect(service.accept('tenant-1', 'u1', 'vX')).rejects.toMatchObject({
        statusCode: 400,
        code: 'POLICY_VERSION_NOT_FOUND',
      });
    });

    it('é idempotente — aceite repetido não quebra (onConflictDoNothing)', async () => {
      repoMock.getCurrentPolicyWithAcceptance.mockResolvedValue({
        currentVersion: { id: 'v1', version: '1.0', content: 'texto' },
        accepted: true,
      });
      repoMock.createAcceptance.mockResolvedValue(null);

      const result = await service.accept('tenant-1', 'u1', 'v1');

      expect(result).toEqual({ accepted: true, currentVersion: '1.0' });
    });
  });
});
