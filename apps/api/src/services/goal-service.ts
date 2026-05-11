import { db, clientGoals } from '@fury/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';
import { centavosToReais } from '../utils/metrics-formatter.js';

export type ClientGoalsForMetrics = {
  id: string;
  targetCpa: number;
  targetRoas: number | null;
  monthlyBudget: number;
};

type MoneyJson = { amount?: number };

function parseMoneyToReais(json: unknown): number {
  const obj = json as MoneyJson | null | undefined;
  const amount = obj?.amount;
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return 0;
  }
  return centavosToReais(Math.round(Number(amount)));
}

export async function getClientGoals(tenantId: string): Promise<ClientGoalsForMetrics> {
  const row = await db.query.clientGoals.findFirst({
    where: eq(clientGoals.tenantId, tenantId),
  });

  if (!row) {
    throw new AppError(404, 'GOALS_NOT_FOUND', 'Metas do cliente nao encontradas para este tenant.');
  }

  const monthlyBudget = parseMoneyToReais(row.monthlyBudget);
  const targetCpa = parseMoneyToReais(row.targetCpa);

  if (targetCpa <= 0) {
    throw new AppError(400, 'INVALID_GOALS', 'targetCpa invalido nas metas do cliente.');
  }

  return {
    id: row.id,
    targetCpa,
    targetRoas: null,
    monthlyBudget,
  };
}
