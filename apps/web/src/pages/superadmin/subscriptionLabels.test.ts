import { describe, expect, it } from 'vitest';
import { formatPlanPrice, intervalLabel, statusLabel } from './subscriptionLabels';

describe('rótulos da assinatura', () => {
  it('status e período em pt-BR', () => {
    expect(statusLabel('active')).toBe('Ativo');
    expect(statusLabel('inactive')).toBe('Inativo');
    expect(statusLabel('trial')).toBe('Teste');
    expect(intervalLabel('monthly')).toBe('mês');
    expect(intervalLabel('yearly')).toBe('ano');
  });

  it('preço em reais com vírgula', () => {
    expect(formatPlanPrice(6900)).toBe('69,00');
    expect(formatPlanPrice(123456)).toBe('1.234,56');
  });
});
