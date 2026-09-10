import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes do PolicyRepository (ADR-0001 — persistência via repository).
 *
 * O repo é tenant-bound via TenantScopedRepository (tenantId no construtor).
 * A injeção de db é feita por parâmetro (default @fury/db) — aqui mockamos
 * o módulo @fury/db para validar comportamento sem banco real.
 */

vi.mock('@fury/db', () => ({
  db: {
    query: {
      policyVersions: { findFirst: vi.fn() },
      policyAcceptances: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    select: vi.fn(),
  },
  // objetos de coluna usados pelo repo (eq/orderBy/desc)
  policyVersions: { id: 'id', version: 'version', content: 'content', effectiveFrom: 'effective_from', createdAt: 'created_at' },
  policyAcceptances: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    policyVersionId: 'policy_version_id',
    acceptedAt: 'accepted_at',
  },
}));

import { db } from '@fury/db';
import { PolicyRepository } from '../repository/policy.repository.js';

const findFirstVersions = db.query.policyVersions.findFirst as ReturnType<typeof vi.fn>;
const findFirstAcceptances = db.query.policyAcceptances.findFirst as ReturnType<typeof vi.fn>;
const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

describe('PolicyRepository', () => {
  let repo: PolicyRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PolicyRepository('tenant-1');
  });

  describe('findCurrentVersion', () => {
    it('busca a versão vigente (inserção mais recente)', async () => {
      const row = { id: 'v1', version: '1.0', content: 'texto' };
      findFirstVersions.mockResolvedValue(row);

      const result = await repo.findCurrentVersion();

      expect(result).toEqual(row);
      expect(findFirstVersions).toHaveBeenCalledTimes(1);
    });

    it('retorna undefined quando não há versões (fail-open)', async () => {
      findFirstVersions.mockResolvedValue(undefined);
      expect(await repo.findCurrentVersion()).toBeUndefined();
    });
  });

  describe('findUserAcceptanceOfVersion', () => {
    it('busca aceite por user + policyVersionId', async () => {
      const row = { id: 'a1', userId: 'u1', policyVersionId: 'v1' };
      findFirstAcceptances.mockResolvedValue(row);

      const result = await repo.findUserAcceptanceOfVersion('u1', 'v1');

      expect(result).toEqual(row);
    });

    it('retorna null quando não há aceite', async () => {
      findFirstAcceptances.mockResolvedValue(null);
      expect(await repo.findUserAcceptanceOfVersion('u1', 'v1')).toBeNull();
    });
  });

  describe('createAcceptance', () => {
    it('grava aceite com idempotência (onConflictDoNothing em user_id+policy_version_id)', async () => {
      const returning = vi.fn().mockResolvedValue([{ id: 'a1' }]);
      const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
      const values = vi.fn().mockReturnValue({ onConflictDoNothing });
      insertMock.mockReturnValue({ values });

      await repo.createAcceptance('u1', 'v1');

      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', userId: 'u1', policyVersionId: 'v1' })
      );
      expect(onConflictDoNothing).toHaveBeenCalled();
    });

    it('retorna null quando o aceite já existia (idempotente)', async () => {
      const returning = vi.fn().mockResolvedValue([]);
      const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
      const values = vi.fn().mockReturnValue({ onConflictDoNothing });
      insertMock.mockReturnValue({ values });

      const result = await repo.createAcceptance('u1', 'v1');

      expect(result).toBeNull();
    });
  });

  describe('hasUserAcceptedAnyVersion', () => {
    it('retorna true quando há aceite de qualquer versão', async () => {
      selectMock.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ ok: 1 }]),
      });

      const result = await repo.hasUserAcceptedAnyVersion('u1');

      expect(result).toBe(true);
      expect(selectMock).toHaveBeenCalledTimes(1);
    });

    it('retorna false quando não há aceite', async () => {
      selectMock.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      expect(await repo.hasUserAcceptedAnyVersion('u1')).toBe(false);
    });
  });

  describe('getCurrentPolicyWithAcceptance', () => {
    it('retorna versão vigente + accepted=false quando usuário não aceitou', async () => {
      findFirstVersions.mockResolvedValue({ id: 'v1', version: '1.0' });
      findFirstAcceptances.mockResolvedValue(null);

      const result = await repo.getCurrentPolicyWithAcceptance('u1');

      expect(result).toEqual({ currentVersion: { id: 'v1', version: '1.0' }, accepted: false });
    });

    it('retorna accepted=true quando usuário aceitou a versão vigente', async () => {
      findFirstVersions.mockResolvedValue({ id: 'v1', version: '1.0' });
      findFirstAcceptances.mockResolvedValue({ id: 'a1', userId: 'u1', policyVersionId: 'v1' });

      const result = await repo.getCurrentPolicyWithAcceptance('u1');

      expect(result).toEqual({
        currentVersion: { id: 'v1', version: '1.0' },
        accepted: true,
      });
    });

    it('retorna fail-open (accepted=true) quando não há versão vigente', async () => {
      findFirstVersions.mockResolvedValue(undefined);

      const result = await repo.getCurrentPolicyWithAcceptance('u1');

      expect(result).toEqual({ currentVersion: undefined, accepted: true });
      expect(findFirstAcceptances).not.toHaveBeenCalled();
    });
  });
});
