import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { extractBase64ImageToFile, findRemoteImageUrl } from '../lib/openrouter-image-response.js';

describe('openrouter-image-response', () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it('findRemoteImageUrl extracts https URLs and ignores data URLs', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'or-resp-'));
    const jsonPath = join(workDir, 'resp.json');
    await writeFile(jsonPath, JSON.stringify({
      choices: [{
        message: {
          content: [{ type: 'image_url', image_url: { url: 'https://cdn.example.com/edited.png' } }],
        },
      }],
    }));

    await expect(findRemoteImageUrl(jsonPath)).resolves.toBe('https://cdn.example.com/edited.png');
  });

  it('extractBase64ImageToFile decodes inline data URLs from JSON', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'or-resp-'));
    const jsonPath = join(workDir, 'resp.json');
    const outputPath = join(workDir, 'out.png');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

    await writeFile(jsonPath, JSON.stringify({
      choices: [{ message: { content: dataUrl } }],
    }));

    const result = await extractBase64ImageToFile(jsonPath, outputPath);
    expect(result.found).toBe(true);
    expect(result.mimeType).toBe('png');
    await expect(readFile(outputPath)).resolves.toEqual(png);
  });
});
