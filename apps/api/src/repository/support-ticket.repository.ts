import { db as defaultDb, type Database, adySupportTickets, adySupportTicketsSync } from '@fury/db';
import { desc, sql } from 'drizzle-orm';

// corta no tamanho da coluna para não derrubar a atualização inteira
const cut = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);
import type { ClickUpTicketSummary, TicketLabel, TicketPriority } from '../lib/clickup-tickets.client.js';

/** Cópia local dos chamados do ClickUp, igual para todos os usuários do admin. */
export class SupportTicketRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async read(): Promise<{ tickets: ClickUpTicketSummary[]; syncedAt: Date | null }> {
    const [sync] = await this.db.select().from(adySupportTicketsSync).limit(1);
    const rows = await this.db.select().from(adySupportTickets).orderBy(desc(adySupportTickets.ticketCreatedAt));
    return {
      syncedAt: sync?.syncedAt ?? null,
      tickets: rows.map((r) => ({
        id: r.clickupId, name: r.name, status: r.status, statusType: r.statusType,
        priority: (r.priority as TicketPriority | null) ?? null, url: r.url,
        createdAt: r.ticketCreatedAt.toISOString(), doneAt: r.doneAt?.toISOString() ?? null,
        assignees: r.assignees, labels: r.labels as TicketLabel[],
      })),
    };
  }

  // troca a lista inteira de uma vez: some do ClickUp, some daqui
  async replaceAll(tickets: ClickUpTicketSummary[], syncedAt: Date): Promise<void> {
    // id repetido (lista mudou durante a leitura): fica o último
    const unique = [...new Map(tickets.map((t) => [t.id, t])).values()];
    await this.db.transaction(async (tx) => {
      // uma atualização por vez; a segunda espera a primeira terminar
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ady_support_tickets_sync'))`);
      await tx.delete(adySupportTickets);
      if (unique.length) {
        await tx.insert(adySupportTickets).values(unique.map((t) => ({
          clickupId: cut(t.id, 64), name: cut(t.name, 1000), status: cut(t.status, 100), statusType: cut(t.statusType, 30), priority: t.priority,
          url: t.url, labels: t.labels, assignees: t.assignees,
          ticketCreatedAt: new Date(t.createdAt), doneAt: t.doneAt ? new Date(t.doneAt) : null, syncedAt,
        })));
      }
      await tx.insert(adySupportTicketsSync).values({ id: 1, syncedAt })
        .onConflictDoUpdate({ target: adySupportTicketsSync.id, set: { syncedAt } });
    });
  }
}
