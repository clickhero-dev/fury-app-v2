import { db as defaultDb, type Database, wppWebhookEvents } from '@fury/db';
import { eq } from 'drizzle-orm';

type WppWebhookEvent = typeof wppWebhookEvents.$inferSelect;

/**
 * Repositório da inbox de webhooks uazapi — GLOBAL (sem tenant):
 * o evento chega antes de qualquer sessão; roteamento para tenant acontece
 * no processamento (worker futuro). ADR-0001.
 */
export class WppWebhookRepository {
  constructor(protected readonly db: Database = defaultDb) {}

  async insertEvent(data: {
    eventType: string | null;
    instanceName: string | null;
    owner: string | null;
    payload: unknown;
  }): Promise<WppWebhookEvent> {
    const [row] = await this.db
      .insert(wppWebhookEvents)
      .values({
        eventType: data.eventType,
        instanceName: data.instanceName,
        owner: data.owner,
        payload: data.payload as any,
      } as any)
      .returning();
    return row;
  }

  async markProcessed(id: string): Promise<void> {
    await this.db
      .update(wppWebhookEvents)
      .set({ status: 'processed', processedAt: new Date() } as any)
      .where(eq(wppWebhookEvents.id, id));
  }
}
