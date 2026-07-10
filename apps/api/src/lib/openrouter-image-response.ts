import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
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

      carry += buf.subarray(0, bytesRead).toString('utf8');
      const match = carry.match(/"url"\s*:\s*"(https?:\/\/[^"\\]+)"/);
      if (match && !match[1].startsWith('data:')) return match[1];

      if (carry.length > 4096) carry = carry.slice(-2048);
    }
  } finally {
    await fh.close();
  }
  return null;
}

/** Streams base64 from a JSON file directly to a binary image file. */
class Base64ImageExtractor extends Transform {
  private phase: 'seek' | 'decode' | 'done' = 'seek';
  private seekTail = '';
  private decodeTail = '';
  mimeType = 'image/png';
  found = false;

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.phase === 'done') return callback();

    const text = this.phase === 'seek'
      ? this.seekTail + chunk.toString('utf8')
      : chunk.toString('utf8');

    if (this.phase === 'seek') {
      const dataIdx = text.indexOf(DATA_URL_PREFIX);
      if (dataIdx === -1) {
        this.seekTail = text.length > 256 ? text.slice(-256) : text;
        return callback();
      }

      const markerIdx = text.indexOf(BASE64_MARKER, dataIdx);
      if (markerIdx === -1) {
        this.seekTail = text.slice(dataIdx);
        return callback();
      }

      const mimeStart = dataIdx + DATA_URL_PREFIX.length;
      this.mimeType = text.slice(mimeStart, markerIdx);
      this.found = true;
      this.phase = 'decode';
      this.seekTail = '';
      this.feedBase64(text.slice(markerIdx + BASE64_MARKER.length), callback);
      return;
    }

    this.feedBase64(text, callback);
  }

  private feedBase64(text: string, callback: (error?: Error | null) => void) {
    const combined = this.decodeTail + text;
    const quoteIdx = combined.indexOf('"');

    if (quoteIdx === -1) {
      const aligned = combined.length - (combined.length % 4);
      if (aligned > 0) {
        this.push(Buffer.from(combined.slice(0, aligned), 'base64'));
        this.decodeTail = combined.slice(aligned);
      } else {
        this.decodeTail = combined;
      }
      return callback();
    }

    const b64 = combined.slice(0, quoteIdx).replace(/\s/g, '');
    if (b64.length > 0) this.push(Buffer.from(b64, 'base64'));
    this.phase = 'done';
    this.decodeTail = '';
    callback();
  }
}

export async function extractBase64ImageToFile(jsonPath: string, outputPath: string): Promise<{ found: boolean; mimeType: string }> {
  const extractor = new Base64ImageExtractor();
  await pipeline(createReadStream(jsonPath, { highWaterMark: 64 * 1024 }), extractor, createWriteStream(outputPath));
  return { found: extractor.found, mimeType: extractor.mimeType };
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

    await pipeline(Readable.fromWeb(body as import('stream/web').ReadableStream), createWriteStream(tmpPath));
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
    await pipeline(Readable.fromWeb(body as import('stream/web').ReadableStream), createWriteStream(jsonPath));

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
