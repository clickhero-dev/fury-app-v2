import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { uploadAsset } from '../storage/storage.service.js';

const STORY_W = 1080;
const STORY_H = 1920;
const MAX_BYTES = 20 * 1024 * 1024;
// Evita decompression bomb (padrão do sharp ~268MP)
const SHARP_OPTS = { limitInputPixels: 40_000_000 };

/** Só processa mídia do nosso R2 (evita SSRF com URL arbitrária). */
function isOwnStorageUrl(url: string): boolean {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return false;
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** Monta 1080x1920 sem corte: imagem inteira centralizada sobre fundo desfocado. */
export async function composeStoryImage(input: Buffer): Promise<Buffer> {
  const background = await sharp(input, SHARP_OPTS)
    .resize(STORY_W, STORY_H, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.7 })
    .toBuffer();
  const foreground = await sharp(input, SHARP_OPTS)
    .resize(STORY_W, STORY_H, { fit: 'inside' })
    .toBuffer();
  return sharp(background)
    .composite([{ input: foreground, gravity: 'center' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Ajusta imagem de story para 9:16 e devolve a URL nova.
 * Já 9:16, fora do R2 ou em falha: devolve a URL original.
 */
export async function fitImageToStory(url: string): Promise<string> {
  if (!isOwnStorageUrl(url)) return url;
  try {
    const res = await fetch(url, { redirect: 'error' });
    if (!res.ok) throw new Error(`download ${res.status}`);
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('imagem acima de 20MB');
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_BYTES) throw new Error('imagem acima de 20MB');

    const { width, height } = await sharp(input, SHARP_OPTS).metadata();
    if (width && height && Math.abs(width / height - 9 / 16) < 0.01) return url;

    const output = await composeStoryImage(input);
    return await uploadAsset(output, `stories/${randomUUID()}.jpg`, 'image/jpeg');
  } catch (err) {
    console.warn(`[fitImageToStory] mantendo original (${url}):`, err instanceof Error ? err.message : err);
    return url;
  }
}
