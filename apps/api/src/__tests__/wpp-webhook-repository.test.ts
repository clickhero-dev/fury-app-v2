import { describe, it, expect, vi } from 'vitest';
import { WppWebhookRepository } from '../repository/wpp-webhook.repository.js';

/** Testes unitários do WppWebhookRepository (GLOBAL) — injeta `db` mockado no construtor. */

function makeDb() {
  const insert = vi.fn(() => ({
    values: (v: any) => ({ returning: async () => [{ id: 'evt-1', ...v }] }),
  }));
  const db: any = {
    insert,
    update: vi.fn(),
    query: {},
  };
  return { db, insert };
}

describe('WppWebhookRepository (GLOBAL)', () => {
  it('insertEvent insere payload cru e retorna a row', async () => {
    const { db, insert } = makeDb();
    const repo = new WppWebhookRepository(db);
    const payload = { EventType: 'messages', token: 'sensivel', message: { id: 'm1' } };
    const row = await repo.insertEvent({
      eventType: 'messages',
      instanceName: 'teste-wpp',
      owner: '5511999999999',
      payload,
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(row.id).toBe('evt-1');
    expect(row.eventType).toBe('messages');
    // payload cru preservado
    expect(row.payload).toEqual(payload);
  });

  it('aceita envelope com campos ausentes (null)', async () => {
    const { db, insert } = makeDb();
    const repo = new WppWebhookRepository(db);
    const row = await repo.insertEvent({ eventType: null, instanceName: null, owner: null, payload: {} });
    expect(row.eventType).toBeNull();
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
