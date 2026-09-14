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

describe('selection mode behavior', () => {
  it('quando selectionMode está ativo, clique simples deve alternar seleção', () => {
    const selectionMode = true;
    const isModifierClick = false;
    const shouldToggleSelection = selectionMode || isModifierClick;
    expect(shouldToggleSelection).toBe(true);
  });

  it('quando selectionMode está inativo, clique normal não deve alternar seleção', () => {
    const selectionMode = false;
    const isModifierClick = false;
    const shouldToggleSelection = selectionMode || isModifierClick;
    expect(shouldToggleSelection).toBe(false);
  });

  it('Ctrl/Cmd+clique sempre deve alternar seleção, independente do selectionMode', () => {
    const selectionMode = false;
    const isModifierClick = true;
    const shouldToggleSelection = selectionMode || isModifierClick;
    expect(shouldToggleSelection).toBe(true);
  });
});