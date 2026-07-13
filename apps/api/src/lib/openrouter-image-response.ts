import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { pipeline } from 'node:stream/promises';
import { ensureStudioAssetsDir, studioAssetsDir } from './temp-storage.js';
import { uploadAssetFromPath } from '../services/storage.service.js';

const BASE64_MARKER = ';base64,';
const DATA_URL_PREFIX = 'data:image/';

function publicStudioUrl(fileName: string): string {
  return `https://${process.env.DOMAIN || 'clickhero-fury-api.u7pe19.easypanel.host'}/studio-assets/${fileName}`;
}

function mimeToExt(mimeType: string): string {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
}

/** Streams a Web ReadableStream to disk without buffering the full body in RAM. */
async function streamWebBodyToFile(body: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
  const reader = body.getReader();
  const ws = createWriteStream(filePath);

  const writeChunk = (chunk: Uint8Array): Promise<void> =>
    new Promise((resolve, reject) => {
      const ok = ws.write(chunk, (err) => {
        if (err) reject(err);
      });
      if (ok) resolve();
      else ws.once('drain', resolve);
      ws.once('error', reject);
    });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) await writeChunk(value);
    }
  } finally {
    reader.releaseLock();
    ws.end();
    await finished(ws);
  }
}

/** Scans a JSON file in chunks for a remote image URL (not data:). */
export async function findRemoteImageUrl(filePath: string): Promise<string | null> {
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const chunkSize = 64 * 1024;
    let carry = '';

    for (let offset = 0; offset < size; offset += chunkSize) {
      const length = Math.min(chunkSize, size - offset);
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      if (bytesRead === 0) break;

      carry += buf.subarray(0, bytesRead).toString('latin1');
      const match = carry.match(/"url"\s*:\s*"(https?:\/\/[^"\\]+)"/);
      if (match && !match[1].startsWith('data:')) return match[1];

      if (carry.length > 4096) carry = carry.slice(-2048);
    }
  } finally {
    await fh.close();
  }
  return null;
}

/** Finds the byte offset where base64 payload starts (after `;base64,`). */
export async function findBase64PayloadStart(filePath: string): Promise<{ byteOffset: number; mimeType: string } | null> {
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const chunkSize = 64 * 1024;
    let tail = Buffer.alloc(0);

    for (let pos = 0; pos < size; pos += chunkSize) {
      const length = Math.min(chunkSize, size - pos);
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await fh.read(chunk, 0, length, pos);
      if (bytesRead === 0) break;

      const scan = bytesRead === length ? Buffer.concat([tail, chunk]) : Buffer.concat([tail, chunk.subarray(0, bytesRead)]);
      const scanStr = scan.toString('latin1');

      const dataIdx = scanStr.indexOf(DATA_URL_PREFIX);
      if (dataIdx !== -1) {
        const markerIdx = scanStr.indexOf(BASE64_MARKER, dataIdx);
        if (markerIdx !== -1) {
          const mimeType = scanStr.slice(dataIdx + DATA_URL_PREFIX.length, markerIdx);
          const scanStartInFile = pos - tail.length;
          const byteOffset = scanStartInFile + markerIdx + BASE64_MARKER.length;
          return { byteOffset, mimeType };
        }
      }

      tail = scan.subarray(Math.max(0, scan.length - 512));
    }
  } finally {
    await fh.close();
  }
  return null;
}

/** Decodes base64 ASCII from a file slice until the closing JSON quote. */
class Base64DecodeUntilQuote extends Transform {
  private leftover = '';
  done = false;

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.done) return callback();

    const text = this.leftover + chunk.toString('latin1');
    const quoteIdx = text.indexOf('"');

    if (quoteIdx === -1) {
      const aligned = text.length - (text.length % 4);
      if (aligned > 0) {
        this.push(Buffer.from(text.slice(0, aligned), 'base64'));
        this.leftover = text.slice(aligned);
      } else {
        this.leftover = text;
      }
      return callback();
    }

    const b64 = text.slice(0, quoteIdx).replace(/\s/g, '');
    if (b64.length > 0) this.push(Buffer.from(b64, 'base64'));
    this.done = true;
    this.leftover = '';
    callback();
  }
}

export async function extractBase64ImageToFile(jsonPath: string, outputPath: string): Promise<{ found: boolean; mimeType: string }> {
  const payload = await findBase64PayloadStart(jsonPath);
  if (!payload) return { found: false, mimeType: 'image/png' };

  const decoder = new Base64DecodeUntilQuote();
  await pipeline(
    createReadStream(jsonPath, { start: payload.byteOffset, highWaterMark: 64 * 1024 }),
    decoder,
    createWriteStream(outputPath),
  );

  return { found: decoder.done, mimeType: payload.mimeType };
}

async function persistLocalImageFile(localPath: string, mimeType: string): Promise<string> {
  const ext = mimeToExt(mimeType);
  const fileName = `${randomUUID()}.${ext}`;

  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    const url = await uploadAssetFromPath(localPath, fileName, mimeType);
    await unlink(localPath).catch(() => {});
    return url;
  }

  await ensureStudioAssetsDir();
  const dest = join(studioAssetsDir, fileName);
  await rename(localPath, dest);
  return publicStudioUrl(fileName);
}

async function persistRemoteImage(remoteUrl: string): Promise<string> {
  const tmpPath = join(tmpdir(), `or-img-${randomUUID()}.bin`);
  try {
    const resp = await fetch(remoteUrl);
    if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
    const body = resp.body;
    if (!body) throw new Error('Empty image response body');

    await streamWebBodyToFile(body, tmpPath);
    const contentType = resp.headers.get('content-type') || 'image/png';
    return persistLocalImageFile(tmpPath, contentType);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    console.warn('[openrouter] Remote image persist failed, using original URL:', (err as Error).message);
    return remoteUrl;
  }
}

/**
 * Persists an OpenRouter/Gemini chat completion response without loading the
 * full JSON + base64 payload into the JS heap.
 */
export async function persistOpenRouterImageResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  const body = response.body;
  if (!body) throw new Error('Empty response body');

  const jsonPath = join(tmpdir(), `or-resp-${randomUUID()}.json`);
  const imagePath = join(tmpdir(), `or-img-${randomUUID()}.bin`);

  try {
    await streamWebBodyToFile(body, jsonPath);

    const remoteUrl = await findRemoteImageUrl(jsonPath);
    if (remoteUrl) return persistRemoteImage(remoteUrl);

    const { found, mimeType } = await extractBase64ImageToFile(jsonPath, imagePath);
    if (!found) throw new Error('Model did not return an image');

    return persistLocalImageFile(imagePath, mimeType);
  } finally {
    await unlink(jsonPath).catch(() => {});
    await unlink(imagePath).catch(() => {});
  }
}
