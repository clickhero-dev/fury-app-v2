import { createReadStream } from 'node:fs';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = 'fury-studio-assets';
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

export async function uploadAsset(buffer: Buffer, fileName: string, mimeType = 'image/png'): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `${PUBLIC_URL}/${fileName}`;
}

export async function uploadAssetFromPath(filePath: string, fileName: string, mimeType = 'image/png'): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    Body: createReadStream(filePath),
    ContentType: mimeType,
  }));

  return `${PUBLIC_URL}/${fileName}`;
}

export async function deleteAsset(urlOrKey: string): Promise<void> {
  const key = PUBLIC_URL && urlOrKey.startsWith(`${PUBLIC_URL}/`)
    ? urlOrKey.slice(`${PUBLIC_URL}/`.length)
    : urlOrKey;

  await r2.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

/** Leitura por chave do bucket fixo; nunca faz fetch da URL fornecida pelo usuário.
 * O chamador deve verificar posse via repository antes desta operação. */
export async function readPlannerVideoAsset(url: string): Promise<Buffer> {
  const base = new URL(process.env.R2_PUBLIC_URL || 'https://unconfigured.invalid');
  const parsed = new URL(url);
  const prefix = `${base.pathname.replace(/\/$/, '')}/`;
  if (!process.env.R2_PUBLIC_URL || parsed.origin !== base.origin || !parsed.pathname.startsWith(prefix) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid storage origin');
  const key = decodeURIComponent(parsed.pathname.slice(prefix.length));
  if (!key || key.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid storage key');
  const signal = AbortSignal.timeout(20_000);
  const result = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }), { abortSignal: signal });
  if (!result.Body) throw new Error('Missing asset');
  const body = result.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
  const cancel = () => body.destroy?.();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Buffer[] = []; let bytes = 0;
    for await (const chunk of body) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > 50 * 1024 * 1024) throw new Error('Asset too large');
      chunks.push(Buffer.from(chunk));
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener('abort', cancel); body.destroy?.(); }
}
