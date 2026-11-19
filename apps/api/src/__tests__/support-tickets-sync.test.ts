import { describe, it, expect, vi } from 'vitest';
import { TicketService } from '../services/tickets/ticket.service.js';
import { ClickUpTicketsError, type ClickUpTicketSummary } from '../lib/clickup-tickets.client.js';

/** Chamados guardados no banco: só [N1]–[N5], atualização de hora em hora ou pelo botão. */
const NOW = new Date('2026-11-19T15:00:00Z');
const ticket = (id: string, name: string, over: Partial<ClickUpTicketSummary> = {}): ClickUpTicketSummary => ({
  id, name, status: 'pendente', statusType: 'open', priority: 'normal', url: `https://app.clickup.com/t/${id}`,
  createdAt: '2026-11-18T10:00:00.000Z', doneAt: null, assignees: [], labels: [], ...over,
});

function setup(stored: { tickets: ClickUpTicketSummary[]; syncedAt: Date | null }, fromClickUp: ClickUpTicketSummary[] | Error) {
  const store = { read: vi.fn().mockResolvedValue(stored), replaceAll: vi.fn().mockResolvedValue(undefined) };
  const client = {
    listTickets: fromClickUp instanceof Error ? vi.fn().mockRejectedValue(fromClickUp) : vi.fn().mockResolvedValue(fromClickUp),
  };
  return { store, client, service: new TicketService(client as any, store) };
}

describe('TicketService.listTickets com cópia no banco', () => {
  const saved = [ticket('a', '[N2] Guardado')];

  it('cópia com menos de 1 hora: lê do banco sem chamar o ClickUp', async () => {
    const { service, client, store } = setup({ tickets: saved, syncedAt: new Date(NOW.getTime() - 59 * 60_000) }, []);
    const res = await service.listTickets({}, NOW);
    expect(client.listTickets).not.toHaveBeenCalled();
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(res.data.open.map((t) => t.id)).toEqual(['a']);
    expect(res.syncedAt).toBe('2026-11-19T14:01:00.000Z');
  });

  it('cópia com 1 hora ou mais: busca, guarda só os [N*] e devolve a hora nova', async () => {
    const fresh = [ticket('n1', '[N1] Novo'), ticket('n5', '[N5] Ideia', { status: 'concluído', statusType: 'closed' }), ticket('pr', 'PR#356'), ticket('f', 'FEAT tela'), ticket('s', 'Sprint 10')];
    const { service, store } = setup({ tickets: saved, syncedAt: new Date(NOW.getTime() - 60 * 60_000) }, fresh);
    const res = await service.listTickets({}, NOW);
    expect(store.replaceAll).toHaveBeenCalledWith([fresh[0], fresh[1]], NOW);
    expect(res.data.open.map((t) => t.id)).toEqual(['n1']);
    expect(res.data.resolved.map((t) => t.id)).toEqual(['n5']);
    expect(res.syncedAt).toBe(NOW.toISOString());
  });

  it('botão Atualizar (refresh) busca mesmo com cópia recente', async () => {
    const { service, client } = setup({ tickets: saved, syncedAt: NOW }, [ticket('b', '[N3] Outro')]);
    const res = await service.listTickets({ refresh: true }, NOW);
    expect(client.listTickets).toHaveBeenCalledTimes(1);
    expect(res.data.open.map((t) => t.id)).toEqual(['b']);
  });

  it('banco vazio busca na primeira vez', async () => {
    const { client, service } = setup({ tickets: [], syncedAt: null }, [ticket('c', '[N4] Primeiro')]);
    await service.listTickets({}, NOW);
    expect(client.listTickets).toHaveBeenCalledTimes(1);
  });

  it('ClickUp fora: mantém a cópia guardada, avisa o motivo e não apaga nada', async () => {
    const old = new Date(NOW.getTime() - 3 * 60 * 60_000);
    const { service, store } = setup({ tickets: saved, syncedAt: old }, new ClickUpTicketsError(502, 'CLICKUP_TIMEOUT', 'x'));
    const res = await service.listTickets({ refresh: true }, NOW);
    expect(store.replaceAll).not.toHaveBeenCalled();
    expect(res.data.open.map((t) => t.id)).toEqual(['a']);
    expect(res.syncedAt).toBe(old.toISOString());
    expect(res.partial_failures).toEqual([{ provider: 'clickup', reason: 'timeout' }]);
  });
});
