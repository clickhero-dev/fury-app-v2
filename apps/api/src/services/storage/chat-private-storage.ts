import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';
import { configuredR2Storage } from './chat-private-r2-storage.js';

export interface ChatPrivateStorage {
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export const storageUnavailable = () => new AppError(503, 'CHAT_STORAGE_UNAVAILABLE', 'Armazenamento privado indisponível.');
export const storageMissing = () => new AppError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
export function validateStorageKey(key: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw storageUnavailable();
}

export class LocalChatPrivateStorage implements ChatPrivateStorage {
  constructor(private readonly root: string) {}
  private async target(key: string): Promise<string> {
    validateStorageKey(key);
    if (!path.isAbsolute(this.root) || path.parse(this.root).root === this.root || /(?:^|[/\\])(public|static|www|wwwroot|public_html|assets|apps[/\\]web)(?:[/\\]|$)/i.test(this.root)) throw storageUnavailable();
    await mkdir(this.root, { mode: 0o700, recursive: true });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()) || await realpath(this.root) !== path.resolve(this.root)) throw storageUnavailable();
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer, _mimeType: string): Promise<void> {
    try {
      const file = await open(await this.target(key), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    } catch { throw storageUnavailable(); }
  }
  async get(key: string): Promise<Buffer> {
    try {
      const file = await open(await this.target(key), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > 50 * 1024 * 1024) throw storageUnavailable();
        return await file.readFile();
      } finally { await file.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw storageMissing(); throw storageUnavailable(); }
  }
  async delete(key: string): Promise<void> {
    try {
      const target = await this.target(key); const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink()) throw storageUnavailable();
      await unlink(target);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw storageUnavailable(); }
  }
}

/** Configuration is lazy: absent optional media infrastructure cannot break API startup. */
export function createChatPrivateStorage(): ChatPrivateStorage {
  const resolve = (): ChatPrivateStorage => {
    const r2 = configuredR2Storage();
    if (r2) return r2;
    if (process.env.NODE_ENV !== 'production' && process.env.CHAT_PRIVATE_STORAGE_DIR) return new LocalChatPrivateStorage(process.env.CHAT_PRIVATE_STORAGE_DIR);
    throw storageUnavailable();
  };
  return { put: async (...args) => resolve().put(...args), get: async key => resolve().get(key), delete: async key => resolve().delete(key) };
}
