import { describe, it, expect, afterEach, vi } from 'vitest';
import { getPeriodDates, type Period } from './period-utils';

/**
 * Simula "hoje" em Brasília via vi.setSystemTime — o getSaoPauloYMD() usa
 * new Date() e formata com timeZone America/Sao_Paulo, então um timestamp
 * com offset -03:00 é suficiente para fixar o dia atual nos testes.
 */
function fakeToday(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('getPeriodDates', () => {
  it('this_month em dia comum (15/09) vai do dia 1 até ontem', () => {
    fakeToday('2026-09-15T12:00:00-03:00');
    expect(getPeriodDates('this_month')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-14',
    });
  });

  it('this_month no dia 1 do mês NÃO inverte o intervalo (bug da barra de progresso)', () => {
    // Regressão: 01/09 → ontem era 31/08 (mês anterior), startDate > endDate,
    // o que zerava as métricas e travava a barra de progresso em 3%.
    fakeToday('2026-09-01T12:00:00-03:00');
    const { startDate, endDate } = getPeriodDates('this_month');
    expect(startDate <= endDate).toBe(true);
    expect(startDate).toBe('2026-09-01');
  });

  it('this_month no 1º dia usa o próprio dia 1 como fim (evita intervalo invertido)', () => {
    fakeToday('2026-09-01T12:00:00-03:00');
    expect(getPeriodDates('this_month')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
  });

  it('this_month nunca retorna endDate < startDate', () => {
    for (const day of [1, 2, 10, 28, 30]) {
      fakeToday(`2026-09-${String(day).padStart(2, '0')}T12:00:00-03:00`);
      const { startDate, endDate } = getPeriodDates('this_month');
      expect(startDate <= endDate, `dia ${day}: ${startDate} > ${endDate}`).toBe(true);
    }
  });

  it('today retorna ontem nos dois extremos', () => {
    fakeToday('2026-09-15T12:00:00-03:00');
    expect(getPeriodDates('today')).toEqual({
      startDate: '2026-09-14',
      endDate: '2026-09-14',
    });
  });

  it('last_7d vai 7 dias até ontem', () => {
    fakeToday('2026-09-15T12:00:00-03:00');
    expect(getPeriodDates('last_7d')).toEqual({
      startDate: '2026-09-08',
      endDate: '2026-09-14',
    });
  });

  it('last_month cobre o mês anterior inteiro', () => {
    fakeToday('2026-09-15T12:00:00-03:00');
    expect(getPeriodDates('last_month')).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });
});