import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { computeTicketStats, TicketStats, type StatsTicket } from './TicketStats';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const t = (over: Partial<StatsTicket>): StatsTicket => ({ status: 'pendente', priority: 'normal', createdAt: daysAgo(1), ...over });

const OPEN = [
  t({ priority: 'urgent', createdAt: daysAgo(2), labels: ['app'], assignees: [{ id: 1, name: 'Kaio' }] }),
  t({ status: 'Homologação', priority: 'high', createdAt: daysAgo(10), labels: ['app', 'meta'], assignees: [{ id: 1, name: 'Kaio' }] }),
  t({ createdAt: daysAgo(40), labels: ['infra'] }),
];
const RESOLVED = [
  t({ status: 'concluído', createdAt: daysAgo(20), doneAt: daysAgo(5), labels: ['meta'] }),
  t({ status: 'concluído', createdAt: daysAgo(60), doneAt: daysAgo(25) }),
  t({ status: 'concluído', createdAt: daysAgo(60), doneAt: null }),
];

describe('computeTicketStats', () => {
  it('30 dias: abertos e homologação sem período; novos e resolvidos na janela', () => {
    const s = computeTicketStats(OPEN, RESOLVED, 30, NOW);
    expect(s).toMatchObject({ open: 3, review: 1, created: 3, resolved: 2, urgent: 1, high: 1 });
    expect(s.byLabel).toEqual([['app', 2], ['meta', 2]]);
    expect(s.byAssignee).toEqual([['Kaio', 2], ['Sem responsável', 1]]);
  });

  it('7 e 15 dias encurtam a janela', () => {
    expect(computeTicketStats(OPEN, RESOLVED, 7, NOW)).toMatchObject({ created: 1, resolved: 1 });
    expect(computeTicketStats(OPEN, RESOLVED, 15, NOW)).toMatchObject({ created: 2, resolved: 1 });
  });
});

describe('TicketStats', () => {
  const card = (label: string) => screen.getByText(label).parentElement!;

  it('começa em 30 dias e troca o período', async () => {
    const user = userEvent.setup();
    render(<TicketStats open={OPEN} resolved={RESOLVED} loading={false} labelName={(v) => v.toUpperCase()} />);
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(card('Abertos agora')).toHaveTextContent('3');
    expect(card('Abertos agora')).toHaveTextContent('1 urgentes · 1 altos');
    expect(card('Em homologação')).toHaveTextContent('1');
    expect(card('Novos')).toHaveTextContent('3');
    expect(screen.getByText('Etiquetas dos novos (30 dias)').parentElement).toHaveTextContent('APP2');

    await user.click(screen.getByRole('button', { name: '7 dias' }));
    expect(card('Novos')).toHaveTextContent('1últimos 7 dias');
    expect(card('Resolvidos')).toHaveTextContent('1últimos 7 dias');
    expect(within(screen.getByText('Abertos por responsável').parentElement!).getByText('Sem responsável')).toBeTruthy();
  });

  it('carregando mostra reticências e esconde os detalhes', () => {
    render(<TicketStats open={[]} resolved={[]} loading labelName={(v) => v} />);
    expect(card('Abertos agora')).toHaveTextContent('…');
    expect(screen.queryByText('Abertos por responsável')).toBeNull();
  });
});
