import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

describe('processo da API com banco indisponível', () => {
  it('mantém health critical acessível antes de sair com código 1', async () => {
    const port = await unusedPort();
    let dbPort = await unusedPort();
    while (dbPort === port) dbPort = await unusedPort();
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)), stdio: 'ignore', env: {
        ...process.env, NODE_ENV: 'development', PORT: String(port),
        DATABASE_URL: `postgresql://test:test@127.0.0.1:${dbPort}/test`,
        REDIS_URL: 'redis://127.0.0.1:1',
      },
    });
    let exitCode: number | null = null;
    const exited = new Promise<void>(resolve => child.once('exit', code => { exitCode = code; resolve(); }));
    let critical = false;
    try {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && exitCode === null) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/health`);
          const body = await response.json() as { status: string; checks: { db?: { category?: string } } };
          if (body.status === 'critical') {
            expect(response.status).toBe(200);
            expect(body.checks.db?.category).toBe('unavailable');
            critical = true;
            break;
          }
        } catch { /* O listener pode ainda não ter iniciado. */ }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      expect(critical).toBe(true);
      await exited;
      expect(exitCode).toBe(1);
    } finally {
      if (exitCode === null) child.kill('SIGKILL');
    }
  }, 30_000);
});
