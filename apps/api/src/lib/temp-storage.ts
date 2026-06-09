import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

export const studioAssetsDir = process.env.STUDIO_ASSETS_DIR ?? '/tmp/studio-assets';

export async function ensureStudioAssetsDir(): Promise<void> {
  await mkdir(studioAssetsDir, { recursive: true });
}

export async function saveTemporaryStudioImage(sourceUrl: string): Promise<{ fileName: string }> {
  await ensureStudioAssetsDir();

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem temporaria: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const extension = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const fileName = `${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(join(studioAssetsDir, fileName), buffer);

  return { fileName };
}