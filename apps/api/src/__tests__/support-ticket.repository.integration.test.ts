import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@fury/db';
import * as schema from '@fury/db';
import { SupportTicketRepository } from '../repository/support-ticket.repository.js';

/** INTEGRAÇÃO (banco de teste): guarda e lê a cópia dos chamados; requer a migração 0080. */
describe('SupportTicketRepository — integração', () => {
  const repo = new SupportTicketRepository(db);
  const base = {
    status: 'pendente', statusType: 'open', priority: 'high' as const, url: 'https://app.clickup.com/t/x',
    createdAt: '2026-11-18T10:00:00.000Z', doneAt: null, labels: ['app' as const], assignees: [{ id: 7, name: 'Kaio' }],
  };

  afterAll(async () => {
    await db.delete(schema.adySupportTickets);
    await db.delete(schema.adySupportTicketsSync);
  });

  it('troca a lista inteira e guarda a hora da atualização', async () => {
    const first = new Date('2026-11-19T10:00:00.000Z');
    await repo.replaceAll([{ ...base, id: 'r-1', name: '[N1] A' }, { ...base, id: 'r-2', name: '[N2] B', createdAt: '2026-11-19T09:00:00.000Z' }], first);
    let state = await repo.read();
    expect(state.syncedAt?.toISOString()).toBe(first.toISOString());
    expect(state.tickets.map((t) => t.id)).toEqual(['r-2', 'r-1']);
    expect(state.tickets[1]).toMatchObject({ priority: 'high', labels: ['app'], assignees: [{ id: 7, name: 'Kaio' }], doneAt: null });

    const second = new Date('2026-11-19T11:00:00.000Z');
    await repo.replaceAll([{ ...base, id: 'r-3', name: '[N3] C', doneAt: '2026-11-19T10:30:00.000Z' }], second);
    state = await repo.read();
    expect(state.syncedAt?.toISOString()).toBe(second.toISOString());
    expect(state.tickets.map((t) => t.id)).toEqual(['r-3']);
    expect(state.tickets[0]!.doneAt).toBe('2026-11-19T10:30:00.000Z');
  });

  it('ids repetidos e textos longos não derrubam a atualização', async () => {
    const at = new Date('2026-11-19T12:00:00.000Z');
    const long = `[N4] ${'x'.repeat(1200)}`;
    await repo.replaceAll([
      { ...base, id: 'd-1', name: '[N1] versão antiga' },
      { ...base, id: 'd-1', name: '[N1] versão nova' },
      { ...base, id: 'd-2', name: long, status: 's'.repeat(150) },
    ], at);
    const state = await repo.read();
    expect(state.tickets.map((t) => t.id).sort()).toEqual(['d-1', 'd-2']);
    expect(state.tickets.find((t) => t.id === 'd-1')!.name).toBe('[N1] versão nova');
    const d2 = state.tickets.find((t) => t.id === 'd-2')!;
    expect(d2.name).toHaveLength(1000);
    expect(d2.status).toHaveLength(100);
  });

  it('duas atualizações ao mesmo tempo terminam sem erro e a lista fica inteira', async () => {
    const list = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `c-${i}`, name: `[N2] ${i}` }));
    const at = new Date('2026-11-19T13:00:00.000Z');
    await expect(Promise.all([repo.replaceAll(list, at), repo.replaceAll(list, at)])).resolves.toBeDefined();
    expect((await repo.read()).tickets).toHaveLength(30);
  });
});
