import { describe, it, expect } from 'vitest';
import { formatPlanDate, planStatusLabel, buildHistoryRows, generatePayload, shouldGiveUpPolling } from './plannerPage.utils';

describe('plannerPage.utils — histórico e formatação', () => {
  it('formatPlanDate: ISO completo e só-data → "05 set 2026"', () => {
    expect(formatPlanDate('2026-09-05')).toBe('05 set 2026');
    expect(formatPlanDate('2026-09-05T12:00:00.000Z')).toBe('05 set 2026');
  });

  it('formatPlanDate: vazio/inválido → "—"', () => {
    expect(formatPlanDate(undefined)).toBe('—');
    expect(formatPlanDate('não-é-data')).toBe('—');
  });

  it('planStatusLabel: draft/active + fallback', () => {
    expect(planStatusLabel('draft')).toBe('Rascunho');
    expect(planStatusLabel('active')).toBe('Ativo');
    expect(planStatusLabel('archived')).toBe('Archived');
  });

  it('generatePayload: NUNCA omite postsCount (default 8 explícito)', () => {
    expect(generatePayload(1)).toEqual({ postsCount: 1 });
    expect(generatePayload()).toEqual({ postsCount: 8 });
    expect(generatePayload(100)).toEqual({ postsCount: 100 });
  });

  it('shouldGiveUpPolling: desiste só após o limite com status de espera', () => {
    const now = Date.now();
    expect(shouldGiveUpPolling('generating', now - 30 * 60 * 1000, now)).toBe(true);
    expect(shouldGiveUpPolling('pending', now - 30 * 60 * 1000, now)).toBe(true);
    expect(shouldGiveUpPolling('generating', now - 1000, now)).toBe(false);
    expect(shouldGiveUpPolling('done', now - 30 * 60 * 1000, now)).toBe(false);
    expect(shouldGiveUpPolling('error', now - 30 * 60 * 1000, now)).toBe(false);
    expect(shouldGiveUpPolling(undefined, now, now)).toBe(false);
  });

  it('buildHistoryRows: mapeia planos da API para linhas de exibição', () => {
    const rows = buildHistoryRows([
      { id: 'p-1', title: 'Plano Setembro', postCount: 8, status: 'draft', createdAt: '2026-09-01T10:00:00Z' as any },
      { id: 'p-2', title: '', postCount: 0, status: 'active', createdAt: '2026-08-15' as any },
    ]);

    expect(rows[0]).toEqual({
      id: 'p-1',
      title: 'Plano Setembro',
      dateLabel: '01 set 2026',
      postCount: 8,
      statusLabel: 'Rascunho',
    });
    expect(rows[1].title).toBe('Plano sem título');
    expect(rows[1].statusLabel).toBe('Ativo');
  });
});