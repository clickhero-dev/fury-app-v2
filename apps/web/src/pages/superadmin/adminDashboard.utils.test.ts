import { describe, it, expect } from 'vitest';
import { formatBRL, planColor, periodDays } from './adminDashboard.utils';

describe('adminDashboard.utils', () => {
  it('formatBRL converte centavos em moeda pt-BR', () => {
    expect(formatBRL(38240)).toBe(`R$${'\u00A0'}382,40`);
    expect(formatBRL(0)).toBe(`R$${'\u00A0'}0,00`);
  });
  it('planColor usa cor fixa por nome e paleta por índice', () => {
    expect(planColor('Pro', 0)).toBe('#1E88A8');
    expect(planColor('Custom', 3)).toBe('#7E8480');
  });
  it('periodDays', () => {
    expect(periodDays('7d')).toBe(7);
    expect(periodDays('90d')).toBe(90);
  });
});