import { createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Cenário: encerramento do probe em conexão sem resposta', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it('fecha o socket sem aguardar o servidor responder', async () => {
    let socket: Socket | undefined;
    let connected!: () => void;
    const accepted = new Promise<void>((resolve) => { connected = resolve; });
    const server = createServer((client) => { socket = client; client.resume(); connected(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('invalid address');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('TEST_DATABASE_URL', `postgres://test:test@127.0.0.1:${address.port}/test`);
      const { createDatabaseProbe } = await import('../../../../packages/db/src/client.js');
      const query = createDatabaseProbe();
      const finished = Promise.resolve(query).catch(() => undefined);
      await accepted;
      const closed = new Promise<void>((resolve) => socket!.once('close', () => resolve()));
      query.cancel();
      await closed;
      await finished;
      expect(socket?.destroyed).toBe(true);
    } finally {
      socket?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
