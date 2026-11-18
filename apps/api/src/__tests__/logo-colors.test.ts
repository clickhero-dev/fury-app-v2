import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractLogoColors } from '../services/brand-kit/logo-colors.js';

describe('extractLogoColors', () => {
  it('retorna as duas cores dominantes de uma logo raster', async () => {
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: { r: 220, g: 20, b: 30 } },
    }).composite([{ input: await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 10, g: 40, b: 180 } } }).png().toBuffer(), left: 10, top: 0 }]).png().toBuffer();
    await expect(extractLogoColors(image)).resolves.toEqual({ primaryColor: '#DC141E', secondaryColor: '#0A28B4' });
  });

  it('não inventa cores quando o arquivo não pode ser lido', async () => {
    await expect(extractLogoColors(Buffer.from('not an image'))).resolves.toBeNull();
  });
});
