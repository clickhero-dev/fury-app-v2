import { beforeEach, describe, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class { send = send; }, GetObjectCommand: class { constructor(public input: unknown) {} }, PutObjectCommand: class {}, DeleteObjectCommand: class {} }));
import { readPlannerVideoAsset } from '../services/storage/storage.service.js';
// Dado asset autorizado pelo service, quando ler, então usa bucket fixo e limites.
describe('BDD: leitura segura de vídeo R2', () => {
  beforeEach(() => { vi.resetAllMocks(); process.env.R2_PUBLIC_URL = 'https://media.example.com/assets'; });
  it('Cenário: URL própria → lê chave pelo SDK, sem fetch da URL', async () => {
    send.mockResolvedValue({ Body: (async function* () { yield Buffer.from('video'); })() });
    expect((await readPlannerVideoAsset('https://media.example.com/assets/posts/t1/v.mp4')).toString()).toBe('video');
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'fury-studio-assets', Key: 'posts/t1/v.mp4' });
    expect(send.mock.calls[0][1].abortSignal).toBeInstanceOf(AbortSignal);
  });
  it.each(['https://evil.example/a', 'https://media.example.com/other/v.mp4', 'https://user:pass@media.example.com/assets/v.mp4', 'https://media.example.com/assets/v.mp4?redirect=evil', 'https://media.example.com/assets/%2e%2e%2fv.mp4'])('Cenário: origem/chave inválida → não lê bucket: %s', async url => {
    await expect(readPlannerVideoAsset(url)).rejects.toBeTruthy(); expect(send).not.toHaveBeenCalled();
  });
  it('Cenário: acima de 50 MiB → cancela stream e rejeita', async () => {
    const destroy = vi.fn();
    send.mockResolvedValue({ Body: { destroy, async *[Symbol.asyncIterator]() { yield Buffer.alloc(51 * 1024 * 1024); } } });
    await expect(readPlannerVideoAsset('https://media.example.com/assets/v.mp4')).rejects.toThrow('Asset too large');
    expect(destroy).toHaveBeenCalled();
  });
});
