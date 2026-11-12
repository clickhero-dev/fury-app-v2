/* Funcionalidade: validar bytes privados, não confiar no MIME declarado.
 * Dado um arquivo selecionado, quando o servidor o decodifica,
 * então somente imagens íntegras e dentro dos limites são aceitas. */
import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatMediaValidator } from '../services/chat/chat-media-validator.js';

import { syntheticPdf, syntheticMedia } from './chat-media.fixtures.js';
const validator = new ChatMediaValidator();

describe('PDF original, inclusive digitalizado', () => {
  it('Dado PDF textual, quando validado, então conta páginas reais', async () => {
    expect(await validator.attachment(file(syntheticPdf(2), 'texto.pdf'))).toMatchObject({ mimeType: 'application/pdf', metadata: { pageCount: 2 } });
  });
  it('Dado PDF escaneado sem texto, então valida e preserva o original para visão', async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).jpeg().toBuffer();
    expect(await validator.attachment(file(syntheticPdf(1, image), 'scan.pdf'))).toMatchObject({ mimeType: 'application/pdf', metadata: { pageCount: 1 } });
  });
  it('Dado PDF com 21 páginas, então recusa o limite', async () => {
    await expect(validator.attachment(file(syntheticPdf(21)))).rejects.toMatchObject({ statusCode: 413 });
  });
  it('Dado PDF genuíno protegido, então rejeita mesmo que seu MIME seja PDF', async () => {
    const { syntheticEncryptedPdf } = await import('./chat-media.fixtures.js');
    const { execFile } = await import('node:child_process');
    const buffer = syntheticEncryptedPdf();
    const info = await new Promise<string>((resolve, reject) => {
      const child = execFile('pdfinfo', ['-upw', 'synthetic-test', '-'], { timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.stdin!.end(buffer);
    });
    expect(info).toMatch(/Encrypted:\s+yes/);
    await expect(validator.attachment(file(buffer, 'protected.pdf', 'application/pdf'))).rejects.toMatchObject({ statusCode: 415 });
  });
  it('Dado PDF corrompido, então não confia em %PDF', async () => {
    await expect(validator.attachment(file(Buffer.from('%PDF-1.7\ninvalid')))).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe('áudio e vídeo nativos', () => {
  it('Dado vídeo MP4 sem áudio, então valida quadros e declara a ausência de áudio', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'color=red:s=32x32:r=2', '-t', '1', '-c:v', 'libx264', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4']);
    expect(await validator.attachment(file(buffer, 'cena.mp4'))).toMatchObject({ mimeType: 'video/mp4', metadata: { hasAudio: false, durationSeconds: 1 } });
  });
  it('Dado MP4 comum com moov no final, então valida sem exigir fast-start', async () => {
    const { syntheticSeekableMp4 } = await import('./chat-media.fixtures.js');
    expect(await validator.attachment(file(await syntheticSeekableMp4(), 'normal.mp4'))).toMatchObject({ mimeType: 'video/mp4', metadata: { durationSeconds: 3 } });
  });
  it('Dado Matroska MKV disfarçado de WebM, então não altera o tipo para aceitá-lo', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'color=blue:s=32x32:r=2', '-t', '1', '-c:v', 'libx264', '-f', 'matroska']);
    await expect(validator.attachment(file(buffer, 'fake.webm'))).rejects.toMatchObject({ statusCode: 415 });
  });
  it('Dado gravação WebM sem duração no header, então mede áudio decodificado', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', '-f', 'webm']);
    expect(await validator.audio(file(buffer))).toMatchObject({ silent: false, durationSeconds: expect.any(Number), format: 'wav' });
  });
  it.each([false, true])('Dado WebM Opus completo (vídeo=%s), então o flush EOF não perde áudio nem cria erro de parser', async (video) => {
    const buffer = await syntheticMedia([
      ...(video ? ['-f', 'lavfi', '-i', 'color=blue:s=32x32:r=2'] : []),
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-t', '1',
      ...(video ? ['-c:v', 'libvpx-vp9', '-threads', '1'] : []), '-c:a', 'libopus', '-f', 'webm',
    ]);
    if (video) {
      const result = await validator.attachment(file(buffer, 'opus.webm'));
      expect(result.metadata.hasAudio).toBe(true);
      expect(result.metadata.durationSeconds).toBeCloseTo(1, 1);
    } else {
      const result = await validator.audio(file(buffer));
      expect(result.durationSeconds).toBe(1);
      expect(result.buffer.length).toBe(32044);
      expect(result.silent).toBe(false);
    }
  });
  it.each([false, true])('Dado pacote Opus corrompido dentro de WebM íntegro (vídeo=%s), então a decodificação estrita rejeita', async (video) => {
    const { corruptSyntheticOpusPacket } = await import('./chat-media.fixtures.js');
    const buffer = await syntheticMedia([
      ...(video ? ['-f', 'lavfi', '-i', 'color=blue:s=32x32:r=2'] : []),
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-t', '1',
      ...(video ? ['-c:v', 'libvpx-vp9', '-threads', '1'] : []), '-c:a', 'libopus', '-f', 'webm',
    ]);
    const corrupt = file(await corruptSyntheticOpusPacket(buffer), 'corrupt.webm');
    await expect(video ? validator.attachment(corrupt) : validator.audio(corrupt)).rejects.toMatchObject({ statusCode: 415, code: 'CHAT_MEDIA_INVALID' });
  });
  it('Dado erro real no stderr com exit 0, então continua rejeitando sem allowlist de mensagens Opus', async () => {
    const { execFile } = await import('node:child_process');
    const { runMediaTool } = await import('../services/chat/chat-media-process.js');
    const { corruptSyntheticOpusPacket } = await import('./chat-media.fixtures.js');
    const buffer = await corruptSyntheticOpusPacket(await syntheticMedia(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', '-f', 'webm']));
    const args = ['-v', 'error', '-protocol_whitelist', 'pipe', '-f', 'matroska', '-i', 'pipe:0', '-show_packets', '-of', 'json'];
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = execFile('ffprobe', args, { timeout: 10000 }, (error, _stdout, stderr) => error ? reject(error) : resolve(stderr));
      child.stdin!.end(buffer);
    });
    expect(stderr).toContain('Error parsing Opus packet header.');
    await expect(runMediaTool('ffprobe', args, buffer)).rejects.toMatchObject({ statusCode: 415, code: 'CHAT_MEDIA_INVALID' });
  });
  it('Dado WebM Opus truncado dentro do último pacote, então não aceita áudio parcial', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libopus', '-f', 'webm']);
    await expect(validator.audio(file(buffer.subarray(0, buffer.length - 80)))).rejects.toMatchObject({ statusCode: 415 });
  });
  it('Dado silêncio, então o servidor detecta sem inventar transcrição', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', '-f', 'wav']);
    expect(await validator.audio(file(buffer))).toMatchObject({ silent: true });
  });
  it('Dado vídeo com áudio, então preserva presença da faixa e valida ambos', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'color=blue:s=32x32:r=2', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libvpx-vp9', '-threads', '1', '-c:a', 'libopus', '-f', 'webm']);
    expect(await validator.attachment(file(buffer, 'audio.webm'))).toMatchObject({ mimeType: 'video/webm', metadata: { hasAudio: true } });
  });
  it('Dado áudio acima de 3min ou vídeo acima de 2min, então recusa duração real', async () => {
    const audio = await syntheticMedia(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '181', '-f', 'wav']);
    await expect(validator.audio(file(audio))).rejects.toMatchObject({ statusCode: 413 });
    const video = await syntheticMedia(['-f', 'lavfi', '-i', 'color=blue:s=16x16:r=1', '-t', '121', '-c:v', 'libx264', '-threads', '1', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4']);
    await expect(validator.attachment(file(video))).rejects.toMatchObject({ statusCode: 413 });
  });
  it('Dado playlist remota disfarçada, então rejeita antes de executar rede', async () => {
    await expect(validator.attachment(file(Buffer.from('#EXTM3U\nhttp://127.0.0.1/private'), 'video.mp4'))).rejects.toMatchObject({ statusCode: 415 });
  });
});
const file = (buffer: Buffer, originalname = '../../foto.png', mimetype = 'text/html') => ({ buffer, originalname, mimetype });

describe('validação de imagem do chat', () => {
  it('Dado PNG real com MIME falso, quando decodificado, então retorna tipo verificado e nome seguro', async () => {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    expect(await validator.attachment(file(buffer))).toMatchObject({ filename: 'foto.png', mimeType: 'image/png', sizeBytes: buffer.length, metadata: { width: 2, height: 2 } });
  });
  it('Dado HTML com cabeçalho PNG, então rejeita os bytes', async () => {
    await expect(validator.attachment(file(Buffer.from('<html>fake</html>'), 'x.png', 'image/png'))).rejects.toMatchObject({ statusCode: 415 });
  });
  it('Dado PNG truncado, então rejeita sem aceitar somente o cabeçalho', async () => {
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(validator.attachment(file(buffer.subarray(0, 36)))).rejects.toMatchObject({ statusCode: 415 });
  });
  it('Dado imagem maior que 10MiB, então rejeita antes da expansão', async () => {
    const buffer = Buffer.alloc(10 * 1024 * 1024 + 1); Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer);
    await expect(validator.attachment(file(buffer))).rejects.toMatchObject({ statusCode: 413 });
  });
});
