import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';

const uploadAsset = vi.fn(async () => 'https://media.test/stories/novo.jpg');
vi.mock('../services/storage/storage.service.js', () => ({
  uploadAsset: (...args: unknown[]) => uploadAsset(...(args as [])),
}));

import { composeStoryImage, fitImageToStory } from '../services/planner/story-image.js';

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#e8631a' } }).png().toBuffer();

const ORIGINAL_ENV = process.env.R2_PUBLIC_URL;

beforeEach(() => {
  process.env.R2_PUBLIC_URL = 'https://media.test';
  uploadAsset.mockClear();
});

afterEach(() => {
  process.env.R2_PUBLIC_URL = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe('composeStoryImage', () => {
  it('quadrada vira JPEG 1080x1920', async () => {
    const out = await composeStoryImage(await png(1080, 1080));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('paisagem também vira 1080x1920', async () => {
    const meta = await sharp(await composeStoryImage(await png(1920, 1080))).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1920]);
  });
});

describe('fitImageToStory', () => {
  it('URL fora do nosso storage: não baixa e devolve a original', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const url = 'https://evil.example/img.png';
    expect(await fitImageToStory(url)).toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('já 9:16: devolve a original sem reupload', async () => {
    const buf = await png(1080, 1920);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(buf)));

    const url = 'https://media.test/story.png';
    expect(await fitImageToStory(url)).toBe(url);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it('quadrada do nosso storage: sobe JPEG 9:16 e devolve URL nova', async () => {
    const buf = await png(1080, 1080);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(buf)));

    expect(await fitImageToStory('https://media.test/quadrada.png')).toBe('https://media.test/stories/novo.jpg');
    expect(uploadAsset).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^stories\/.+\.jpg$/), 'image/jpeg');
  });

  it('falha no download: devolve a original (não bloqueia a publicação)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));

    const url = 'https://media.test/sumiu.png';
    expect(await fitImageToStory(url)).toBe(url);
  });
});
