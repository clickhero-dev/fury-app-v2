import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { type ChatPrivateStorage, storageUnavailable, storageMissing, validateStorageKey } from './chat-private-storage.js';

function missing(error: unknown): boolean { return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404; }

/** Private R2 uses server SDK access only: no presigned/public URL or public bucket fallback. */
export class R2ChatPrivateStorage implements ChatPrivateStorage {
  constructor(private readonly bucket: string, private readonly client: S3Client) {}
  private input(key: string) {
    validateStorageKey(key);
    if (!this.bucket || this.bucket === 'fury-studio-assets') throw storageUnavailable();
    return { Bucket: this.bucket, Key: key };
  }
  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    const signal = AbortSignal.timeout(15_000);
    try {
      await this.client.send(new PutObjectCommand({ ...this.input(key), Body: bytes, ContentType: mimeType, CacheControl: 'private, no-store', IfNoneMatch: '*' }), { abortSignal: signal });
      const info = await this.client.send(new HeadObjectCommand(this.input(key)), { abortSignal: signal });
      if (info.ContentLength !== bytes.length) throw storageUnavailable();
    } catch { throw storageUnavailable(); }
  }
  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(new GetObjectCommand(this.input(key)), { abortSignal: AbortSignal.timeout(15_000) });
      if (!response.Body) throw storageUnavailable();
      const parts: Buffer[] = []; let size = 0;
      for await (const part of response.Body as AsyncIterable<Uint8Array>) {
        size += part.byteLength;
        if (size > 50 * 1024 * 1024) throw storageUnavailable();
        parts.push(Buffer.from(part));
      }
      return Buffer.concat(parts);
    } catch (error) { if (missing(error)) throw storageMissing(); throw storageUnavailable(); }
  }
  async delete(key: string): Promise<void> {
    const signal = AbortSignal.timeout(15_000);
    try {
      await this.client.send(new DeleteObjectCommand(this.input(key)), { abortSignal: signal });
      try { await this.client.send(new HeadObjectCommand(this.input(key)), { abortSignal: signal }); }
      catch (error) { if (missing(error)) return; throw error; }
      throw storageUnavailable();
    } catch { throw storageUnavailable(); }
  }
}

export function configuredR2Storage(): ChatPrivateStorage | undefined {
  const bucket = process.env.CHAT_PRIVATE_R2_BUCKET;
  if (!bucket) return undefined;
  const account = process.env.CHAT_PRIVATE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CHAT_PRIVATE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CHAT_PRIVATE_R2_SECRET_ACCESS_KEY;
  // Operator explicitly confirms no r2.dev/custom public domains. S3 alone cannot inspect those settings.
  if (bucket === 'fury-studio-assets' || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket) || !account || !/^[a-f0-9]{32}$/.test(account) || !accessKeyId || !secretAccessKey || process.env.CHAT_PRIVATE_R2_PRIVACY_CONFIRMED !== 'true') throw storageUnavailable();
  return new R2ChatPrivateStorage(bucket, new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1, followRegionRedirects: false }));
}
