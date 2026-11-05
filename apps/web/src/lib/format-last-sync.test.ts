import { describe, expect, it } from 'vitest';
import { formatLastSync, getLatestSync } from './format-last-sync';

describe('formatLastSync', () => {
  it('formata o instante da última atualização no horário de São Paulo', () => {
    expect(formatLastSync('2026-09-28T17:30:00.000Z')).toBe('28/09 às 14:30');
  });

  it('não exibe uma data quando o instante está ausente ou é inválido', () => {
    expect(formatLastSync(null)).toBeNull();
    expect(formatLastSync('data-inválida')).toBeNull();
  });

  it('escolhe a atualização mais recente entre respostas da mesma tela', () => {
    expect(getLatestSync('2026-09-28T16:30:00.000Z', null, '2026-09-28T17:30:00.000Z')).toBe('2026-09-28T17:30:00.000Z');
  });
});
