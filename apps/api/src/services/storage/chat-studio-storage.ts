import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { BUCKET, r2 } from './storage.service.js';
import { createChatPrivateStorage, storageMissing, storageUnavailable, validateStorageKey, type ChatPrivateStorage } from './chat-private-storage.js';

const prefix = 'chat-images/';

/** New images use the Studio bucket. Unprefixed legacy keys remain in private storage. */
export class ChatStudioStorage implements ChatPrivateStorage {
  constructor(private readonly client: S3Client, private readonly legacy: ChatPrivateStorage) {}

  newKey(mimeType: string): string {
    return mimeType.startsWith('image/') ? `${prefix}${randomUUID()}` : randomUUID();
  }

  private isStudio(key: string): boolean {
    if (key.startsWith(prefix)) {
      validateStorageKey(key.slice(prefix.length));
      return true;
    }
    validateStorageKey(key);
    return false;
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    if (!this.isStudio(key)) return this.legacy.put(key, bytes, mimeType);
    try {
      await this.client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: mimeType }));
    } catch { throw storageUnavailable(); }
  }

  async get(key: string): Promise<Buffer> {
    if (!this.isStudio(key)) return this.legacy.get(key);
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      if (!response.Body) throw storageUnavailable();
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > 10 * 1024 * 1024) throw storageUnavailable();
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) throw storageMissing();
      throw storageUnavailable();
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isStudio(key)) return this.legacy.delete(key);
    try { await this.client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); }
    catch { throw storageUnavailable(); }
  }
}

export function createChatStudioStorage(): ChatPrivateStorage {
  return new ChatStudioStorage(r2, createChatPrivateStorage());
}
