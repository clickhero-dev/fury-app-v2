/*
 * Funcionalidade: recuperar planos ao iniciar o worker
 * Cenário: o worker pronto agenda a recuperação e consulta o estado persistido
 * Dado Redis descartável e um repositório de recuperação vazio
 * Quando o worker inicializa
 * Então registra um scheduler único e executa a conciliação inicial.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ChatPlanQueue, startChatPlanWorkerRuntime } from '../workers/chat-plan.worker.js';

const redis = process.env.CHAT_PLAN_TEST_REDIS_URL;
const suite = redis ? describe : describe.skip;

suite('inicialização isolada do worker de planos', () => {
  it('registra scheduler e concilia o banco antes de retornar', async () => {
    const url = new URL(redis!);
    if (url.hostname !== '127.0.0.1') throw new Error('Somente Redis descartável explícito');
    const connection = { host: '127.0.0.1', port: Number(url.port) };
    const prefix = `chat-plan-startup-${randomUUID()}`;
    const queue = new ChatPlanQueue(connection, { prefix });
    const recovery = { listRecoverable: vi.fn(async () => []) };
    let worker: Awaited<ReturnType<typeof startChatPlanWorkerRuntime>> | undefined;

    try {
      worker = await startChatPlanWorkerRuntime(connection, { run: vi.fn(async () => undefined) }, queue, recovery, { prefix });
      expect(await queue.queue.getJobSchedulersCount()).toBe(1);
      expect(recovery.listRecoverable).toHaveBeenCalledWith(undefined);
    } finally {
      await worker?.close();
      await queue.queue.obliterate({ force: true });
      await queue.close();
    }
  }, 15000);
});
