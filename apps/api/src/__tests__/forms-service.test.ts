import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => {
  const insertReturning = vi.fn();
  const updateReturning = vi.fn();
  return {
    query: {
      formSubmissions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: insertReturning,
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: updateReturning,
        })),
      })),
    })),
    insertReturning,
    updateReturning,
  };
});

vi.mock('@fury/db', () => ({
  db: dbMock,
}));

vi.mock('@fury/db/schema', () => ({
  formSubmissions: { id: 'id', tenantId: 'tenantId', userId: 'userId', formType: 'formType' },
}));

import {
  startFormSubmission,
  completeFormSubmission,
  errorFormSubmission,
  abandonedFormSubmission,
} from '../services/forms/forms.service.js';

describe('startFormSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria submissão com status PENDING e retorna o registro', async () => {
    const row = { id: 'sub-1', tenantId: 't-1', status: 'PENDING' };
    dbMock.insertReturning.mockResolvedValue([row]);

    const result = await startFormSubmission('t-1', 'u-1', 'onboarding');

    expect(dbMock.insert).toHaveBeenCalled();
    expect(result).toBe(row);
  });

  it('lança 500 quando insert não retorna registro', async () => {
    dbMock.insertReturning.mockResolvedValue([]);

    await expect(startFormSubmission('t-1', 'u-1', 'onboarding')).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('completeFormSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marca COMPLETED e retorna o registro atualizado', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
    const updated = { id: 'sub-1', status: 'COMPLETED' };
    dbMock.updateReturning.mockResolvedValue([updated]);

    const result = await completeFormSubmission('sub-1', 't-1');

    expect(result).toBe(updated);
    expect(dbMock.update).toHaveBeenCalled();
  });

  it('lança 404 quando submissão não pertence ao tenant', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue(null);

    await expect(completeFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('lança 500 quando update não retorna registro', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
    dbMock.updateReturning.mockResolvedValue([]);

    await expect(completeFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('errorFormSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lança 404 quando submissão não existe', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue(null);

    await expect(errorFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('marca ERROR e retorna o registro', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
    const updated = { id: 'sub-1', status: 'ERROR' };
    dbMock.updateReturning.mockResolvedValue([updated]);

    const result = await errorFormSubmission('sub-1', 't-1');

    expect(result.status).toBe('ERROR');
  });
});

describe('abandonedFormSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lança 404 quando submissão não existe', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue(null);

    await expect(abandonedFormSubmission('sub-1', 't-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('marca ABANDONED e retorna o registro', async () => {
    dbMock.query.formSubmissions.findFirst.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
    const updated = { id: 'sub-1', status: 'ABANDONED' };
    dbMock.updateReturning.mockResolvedValue([updated]);

    const result = await abandonedFormSubmission('sub-1', 't-1');

    expect(result.status).toBe('ABANDONED');
  });
});
