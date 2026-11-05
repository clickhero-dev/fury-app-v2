import { describe, it, expect } from 'vitest';
import { formatDuration, formatCost } from './studio-metrics';

describe('studio-metrics', () => {
  it('formatDuration: segundos com vírgula (pt-BR)', () => {
    expect(formatDuration(3200)).toBe('3,2s');
    expect(formatDuration(1000)).toBe('1,0s');
  });

  it('formatDuration: milissegundos abaixo de 1s', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formatDuration: ignora valores inválidos', () => {
    expect(formatDuration(-1)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });

  it('formatCost: dólar em pt-BR', () => {
    expect(formatCost(0.04)).toBe('US$ 0,04');
    expect(formatCost(1.5)).toBe('US$ 1,50');
  });
});