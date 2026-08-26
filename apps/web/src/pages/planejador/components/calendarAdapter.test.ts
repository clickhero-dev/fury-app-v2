import { describe, it, expect } from 'vitest';
import { resolveEventClickAction } from './calendarAdapter';

describe('resolveEventClickAction', () => {
  it('clique normal abre o painel de detalhes do post', () => {
    expect(resolveEventClickAction(false)).toBe('open-detail');
  });

  it('Ctrl/Cmd+clique alterna a multisseleção (ações em lote)', () => {
    expect(resolveEventClickAction(true)).toBe('toggle-selection');
  });
});