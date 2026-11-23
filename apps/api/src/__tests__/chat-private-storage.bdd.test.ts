/* Funcionalidade: storage privado separado dos assets públicos.
 * Dado um diretório privado isolado, quando salvamos bytes e removemos,
 * então não há URL pública, path traversal nem symlink; produção falha fechada. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { LocalChatPrivateStorage, createChatPrivateStorage } from '../services/storage/chat-private-storage.js';
import { R2ChatPrivateStorage } from '../services/storage/chat-private-r2-storage.js';
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
let root: string;

describe('R2 dedicado privado', () => {
  it('usa bucket separado, sem ACL/public URL; confirma put/delete com HEAD', async () => {
    const bytes = Buffer.from('private'); const key = randomUUID(); let exists = false;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof PutObjectCommand) { exists = true; return {}; }
      if (command instanceof DeleteObjectCommand) { exists = false; return {}; }
      if (command instanceof HeadObjectCommand) {
        if (!exists) throw { $metadata: { httpStatusCode: 404 } };
        return { ContentLength: bytes.length };
      }
      if (command instanceof GetObjectCommand) return { Body: { async *[Symbol.asyncIterator]() { yield bytes; } } };
      throw new Error('unexpected command');
    });
    const storage = new R2ChatPrivateStorage('private-chat-tests', { send } as never);
    await storage.put(key, bytes, 'image/png');
    expect(await storage.get(key)).toEqual(bytes);
    await storage.delete(key);
    expect(send.mock.calls.map(([command]) => (command as { input: unknown }).input)).toEqual(expect.arrayContaining([
      expect.objectContaining({ Bucket: 'private-chat-tests', Key: key, Body: bytes, ContentType: 'image/png', CacheControl: 'private, no-store' }),
    ]));
    expect(send.mock.calls[0][0]).not.toHaveProperty('input.ACL');
    expect(send.mock.calls.filter(([command]) => command instanceof HeadObjectCommand)).toHaveLength(2);
  });
  it('erro R2 não expõe endpoint/credenciais', async () => {
    const storage = new R2ChatPrivateStorage('private-chat-tests', { send: async () => { throw new Error('secret key endpoint'); } } as never);
    await expect(storage.put(randomUUID(), Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 503, message: 'Armazenamento privado indisponível.' });
  });
});
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'chat-private-test-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('storage local privado', () => {
  it('salva e relê bytes com permissão 0600; delete concorrente permanece idempotente', async () => {
    const store = new LocalChatPrivateStorage(root); const key = randomUUID();
    await store.put(key, Buffer.from('synthetic'), 'image/png');
    expect(await store.get(key)).toEqual(Buffer.from('synthetic'));
    expect((await stat(path.join(root, key))).mode & 0o777).toBe(0o600);
    await Promise.all([store.delete(key), store.delete(key)]);
    await expect(store.get(key)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('não sobrescreve objeto existente', async () => {
    const store = new LocalChatPrivateStorage(root); const key = randomUUID();
    await store.put(key, Buffer.from('one'), 'image/png');
    await expect(store.put(key, Buffer.from('two'), 'image/png')).rejects.toMatchObject({ statusCode: 503 });
    expect(await store.get(key)).toEqual(Buffer.from('one'));
  });
  it('nega chaves com traversal e symlinks antes de acessar arquivos', async () => {
    const store = new LocalChatPrivateStorage(root); const key = randomUUID();
    await expect(store.get('../secret')).rejects.toMatchObject({ statusCode: 503 });
    await symlink('/etc/hosts', path.join(root, key));
    await expect(store.get(key)).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.delete(key)).rejects.toMatchObject({ statusCode: 503 });
  });
  it('produção sem bucket dedicado confirmado não usa local nem público como fallback', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('CHAT_PRIVATE_STORAGE_DIR', root);
    vi.stubEnv('CHAT_PRIVATE_R2_BUCKET', '');
    await expect(createChatPrivateStorage().put(randomUUID(), Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 503 });
    vi.stubEnv('CHAT_PRIVATE_R2_BUCKET', 'fury-studio-assets');
    await expect(createChatPrivateStorage().put(randomUUID(), Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 503 });
  });
  it('recusa root relativo ou dentro de static/public', async () => {
    for (const invalid of ['relative', '/', path.join(root, 'public'), path.join(root, 'apps/web/src/uploads')]) {
      await expect(new LocalChatPrivateStorage(invalid).put(randomUUID(), Buffer.from('x'), 'image/png')).rejects.toMatchObject({ statusCode: 503 });
    }
  });
});
