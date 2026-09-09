/**
 * Testes do CampaignBudgetForm (Fluxo 3 — F3.7).
 *
 * Cobre a conversão verba mensal → orçamento médio diário (mensal / 30.4,
 * padrão Google "average daily budget") — a regra de negócio do form.
 */
import { describe, it, expect } from 'vitest';
import { monthlyToDaily } from '../components/CampaignBudgetForm';

describe('monthlyToDaily', () => {
  it('converte R$ 300/mês → ~R$ 9,87/dia', () => {
    const daily = monthlyToDaily(300);
    expect(daily).toBeCloseTo(9.86, 1);
  });

  it('converte R$ 1.000/mês → ~R$ 32,89/dia', () => {
    const daily = monthlyToDaily(1000);
    expect(daily).toBeCloseTo(32.89, 1);
  });

  it('mantém proporção com verba mínima (R$ 30)', () => {
    expect(monthlyToDaily(30)).toBeCloseTo(0.99, 1);
  });
});