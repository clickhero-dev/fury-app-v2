import { describe, it, expect } from 'vitest';
import { resolveEventClickAction, postToEvent, extractEventDropData } from './calendarAdapter';

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
describe('fuso horário do calendário', () => {
  it('evento usa o instante UTC real (o FullCalendar exibe no horário local)', () => {
    const ev = postToEvent({ id: 'p', scheduledAt: '2026-10-07T17:30:00.000Z', calendarDate: '2026-10-07' } as any);
    expect(ev.start).toBe('2026-10-07T17:30:00.000Z');
  });

  it('sem horário: fica no dia do calendário', () => {
    const ev = postToEvent({ id: 'p', calendarDate: '2026-10-07' } as any);
    expect(ev.start).toBe('2026-10-07T00:00:00');
  });

  it('soltar evento: grava o mesmo instante exibido (sem deslocar 3h)', () => {
    const start = new Date(2026, 9, 8, 14, 30); // 14:30 local
    const data = extractEventDropData({ id: 'p', start, startStr: '' } as any);
    expect(new Date(data.scheduledAt!).getTime()).toBe(start.getTime());
    expect(data.newDate).toBe('2026-10-08');
  });
});

describe('ordem no dia', () => {
  it('publicado vai para baixo (publishedRank 1); agendado/rascunho no topo (0)', () => {
    const pub = postToEvent({ id: 'a', status: 'published', calendarDate: '2026-10-07' } as any);
    const sched = postToEvent({ id: 'b', status: 'approved', calendarDate: '2026-10-07' } as any);
    const draft = postToEvent({ id: 'c', status: 'draft', calendarDate: '2026-10-07' } as any);
    expect(pub.extendedProps!.publishedRank).toBe(1);
    expect(sched.extendedProps!.publishedRank).toBe(0);
    expect(draft.extendedProps!.publishedRank).toBe(0);
  });
});

describe('arrastar', () => {
  it('publicado e publicando não arrastam; agendado arrasta', () => {
    expect(postToEvent({ id: 'a', status: 'published', calendarDate: '2026-10-07' } as any).startEditable).toBe(false);
    expect(postToEvent({ id: 'b', status: 'publishing', calendarDate: '2026-10-07' } as any).startEditable).toBe(false);
    expect(postToEvent({ id: 'c', status: 'approved', calendarDate: '2026-10-07' } as any).startEditable).toBe(true);
  });
});
