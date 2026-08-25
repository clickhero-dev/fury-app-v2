import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  query: {
    clientGoals: { findFirst: vi.fn() },
  },
}));

vi.mock('../lib/db.js', () => ({
  db: dbMock,
  clientGoals: { tenantId: 'tenantId' },
}));

vi.mock('../utils/metrics-formatter.js', () => ({
  centavosToReais: vi.fn((v: number) => v / 100),
}));

import { getClientGoals } from '../services/campaigns/goal.service.js';

describe('getClientGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converte metas de centavos para reais', async () => {
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      id: 'goals-1',
      targetCpa: { amount: 5000 },      // 5000 centavos = R$ 50,00
      monthlyBudget: { amount: 300000 }, // 300000 centavos = R$ 3000,00
    });

    const result = await getClientGoals('t-1');

    expect(result).toEqual({
      id: 'goals-1',
      targetCpa: 50,
      targetRoas: null,
      monthlyBudget: 3000,
    });
  });

  it('lança 404 (GOALS_NOT_FOUND) quando tenant não tem metas', async () => {
    dbMock.query.clientGoals.findFirst.mockResolvedValue(null);

    await expect(getClientGoals('t-1')).rejects.toMatchObject({
      statusCode: 404,
      code: 'GOALS_NOT_FOUND',
    });
  });

  it('lança 400 (INVALID_GOALS) quando targetCpa é zero', async () => {
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      id: 'goals-1',
      targetCpa: { amount: 0 },
      monthlyBudget: { amount: 100000 },
    });

    await expect(getClientGoals('t-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_GOALS',
    });
  });

  it('trata monthlyBudget ausente/null como 0', async () => {
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      id: 'goals-1',
      targetCpa: { amount: 5000 },
      monthlyBudget: null,
    });

    const result = await getClientGoals('t-1');

    expect(result.monthlyBudget).toBe(0);
    expect(result.targetCpa).toBe(50);
  });

  it('trata targetCpa ausente como 0 e lança INVALID_GOALS', async () => {
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      id: 'goals-1',
      targetCpa: undefined,
      monthlyBudget: { amount: 100000 },
    });

    await expect(getClientGoals('t-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_GOALS',
    });
  });
});
