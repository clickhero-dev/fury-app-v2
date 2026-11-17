import { describe, it, expect } from 'vitest';
import { formatBRL, planColor, periodDays, parseBRLToCents, formatYMD } from './adminDashboard.utils';

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

  it('parseBRLToCents aceita formatos em reais e recusa inválidos', () => {
    expect(parseBRLToCents('5.000,00')).toBe(500000);
    expect(parseBRLToCents('5000')).toBe(500000);
    expect(parseBRLToCents('R$ 49,9')).toBe(4990);
    expect(parseBRLToCents('0,05')).toBe(5);
    expect(parseBRLToCents('5.00')).toBeNull();
    expect(parseBRLToCents('abc')).toBeNull();
    expect(parseBRLToCents('')).toBeNull();
    expect(parseBRLToCents('1,234')).toBeNull();
  });

  it('formatYMD mostra a data sem fuso', () => {
    expect(formatYMD('2026-11-10')).toBe('10/11/2026');
  });
});
