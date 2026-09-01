import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormsService } from '../services/forms/forms.service.js';

function mockRepo(overrides: Record<string, any> = {}) {
  return {
    createFormSubmission: vi.fn(),
    findFormSubmission: vi.fn(),
    patchFormSubmission: vi.fn(),
    ...overrides,
  };
}

function makeService(repo: ReturnType<typeof mockRepo>) {
  return new FormsService(() => repo as any);
}

describe('FormsService', () => {
  let repo: ReturnType<typeof mockRepo>;
  let service: FormsService;

  beforeEach(() => {
    repo = mockRepo();
    service = makeService(repo);
  });

  describe('startFormSubmission', () => {
    it('cria submissão com status PENDING e retorna o registro', async () => {
      const row = { id: 'sub-1', tenantId: 't-1', status: 'PENDING' };
      repo.createFormSubmission.mockResolvedValue(row);

      const result = await service.startFormSubmission('t-1', 'u-1', 'onboarding');

      expect(repo.createFormSubmission).toHaveBeenCalledWith({
        userId: 'u-1',
        formType: 'onboarding',
        status: 'PENDING',
      });
      expect(result).toBe(row);
    });

    it('lança 500 quando insert não retorna registro', async () => {
      repo.createFormSubmission.mockResolvedValue(undefined);

      await expect(service.startFormSubmission('t-1', 'u-1', 'onboarding')).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('completeFormSubmission', () => {
    it('marca COMPLETED e retorna o registro atualizado', async () => {
      const updated = { id: 'sub-1', status: 'COMPLETED' };
      repo.findFormSubmission.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      repo.patchFormSubmission.mockResolvedValue(updated);

      const result = await service.completeFormSubmission('sub-1', 't-1');

      expect(repo.findFormSubmission).toHaveBeenCalledWith('sub-1');
      expect(repo.patchFormSubmission).toHaveBeenCalledWith('sub-1', expect.objectContaining({ status: 'COMPLETED' }));
      expect(result).toBe(updated);
    });

    it('lança 404 quando submissão não pertence ao tenant', async () => {
      repo.findFormSubmission.mockResolvedValue(null);

      await expect(service.completeFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('lança 500 quando update não retorna registro', async () => {
      repo.findFormSubmission.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      repo.patchFormSubmission.mockResolvedValue(undefined);

      await expect(service.completeFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('errorFormSubmission', () => {
    it('lança 404 quando submissão não existe', async () => {
      repo.findFormSubmission.mockResolvedValue(null);

      await expect(service.errorFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('marca ERROR e retorna o registro', async () => {
      const updated = { id: 'sub-1', status: 'ERROR' };
      repo.findFormSubmission.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      repo.patchFormSubmission.mockResolvedValue(updated);

      const result = await service.errorFormSubmission('sub-1', 't-1');

      expect(repo.patchFormSubmission).toHaveBeenCalledWith('sub-1', expect.objectContaining({ status: 'ERROR' }));
      expect(result.status).toBe('ERROR');
    });
  });

  describe('abandonedFormSubmission', () => {
    it('lança 404 quando submissão não existe', async () => {
      repo.findFormSubmission.mockResolvedValue(null);

      await expect(service.abandonedFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('marca ABANDONED e retorna o registro', async () => {
      const updated = { id: 'sub-1', status: 'ABANDONED' };
      repo.findFormSubmission.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      repo.patchFormSubmission.mockResolvedValue(updated);

      const result = await service.abandonedFormSubmission('sub-1', 't-1');

      expect(repo.patchFormSubmission).toHaveBeenCalledWith('sub-1', expect.objectContaining({ status: 'ABANDONED', abandonedAt: expect.any(Date) }));
      expect(result.status).toBe('ABANDONED');
    });
  });
});