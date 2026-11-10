import sharp from 'sharp';
import path from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runMediaTool } from './chat-media-process.js';

const protocols = ['-v', 'error', '-protocol_whitelist', 'pipe', '-max_alloc', '67108864', '-threads', '1'];
function isWebm(buffer: Buffer): boolean {
  function vint(offset: number, id = false): { value: number; length: number } {
    let length = 1; let mask = 0x80;
    while (length <= 8 && !(buffer[offset] & mask)) { length++; mask >>= 1; }
    if (length > 8 || offset + length > buffer.length) throw invalidMedia();
    let value = id ? buffer[offset] : buffer[offset] & (mask - 1);
    for (let i = 1; i < length; i++) value = value * 256 + buffer[offset + i];
    return { value, length };
  }
  try {
    const header = vint(4); let offset = 4 + header.length; const end = offset + header.value;
    if (end > buffer.length || end > 4096) return false;
    while (offset < end) {
      const id = vint(offset, true); offset += id.length;
      const size = vint(offset); offset += size.length;
      if (offset + size.value > end) return false;
      if (id.value === 0x4282) return buffer.toString('ascii', offset, offset + size.value) === 'webm';
      offset += size.value;
    }
  } catch { return false; }
  return false;
}
async function nativeMedia(tool: 'ffprobe' | 'ffmpeg', buffer: Buffer, container: string, output: string[], maxBuffer?: number): Promise<Buffer> {
  const errorOnDecode = tool === 'ffmpeg' ? ['-xerror'] : [];
  // WebM already supplies complete, timestamped packets. FFmpeg 8's Opus parser
  // parses an empty EOF flush as a corrupt header (upstream fix 618fc15e65f5).
  // Bypass only this redundant framing pass, not decoding: explode, -xerror and
  // runMediaTool's nonempty-stderr rejection still reject real packet corruption.
  const packetizedWebm = container === 'matroska' ? ['-fflags', '+noparse+nofillin', '-err_detect', 'explode'] : [];
  if (container !== 'mov') return runMediaTool(tool, [...protocols, ...errorOnDecode, ...packetizedWebm, '-f', container, '-i', 'pipe:0', ...output], buffer, maxBuffer);
  // Ordinary MP4 may need seeking (moov at the end). The only file path comes from our 0700 temp directory.
  // Force MOV demuxing and disable ALL external data references; never enable network protocols.
  const directory = await mkdtemp(path.join(tmpdir(), 'chat-mp4-'));
  try {
    const input = path.join(directory, 'input.mp4'); await writeFile(input, buffer, { mode: 0o600 });
    return await runMediaTool(tool, ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov', '-max_alloc', '67108864', '-threads', '1', ...errorOnDecode, '-enable_drefs', '0', '-use_absolute_path', '0', '-f', 'mov', '-i', input, ...output], undefined, maxBuffer);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
function mediaContainer(buffer: Buffer): 'mov' | 'matroska' | 'wav' | 'ogg' | 'mp3' | 'flac' | undefined {
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return 'mov';
  if (buffer.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')) && isWebm(buffer)) return 'matroska';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (buffer.toString('ascii', 0, 4) === 'fLaC') return 'flac';
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 255 && (buffer[1] & 0xe0) === 0xe0)) return 'mp3';
}
interface Probe { streams: Array<{ codec_type: string; width?: number; height?: number; duration?: string; nb_read_frames?: string }>; format: { duration?: string } }
function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const MiB = 1024 * 1024;
export interface MediaInput { buffer: Buffer; originalname: string; mimetype?: string }
export interface MediaMetadata { uploadState?: 'pending' | 'ready'; width?: number; height?: number; pageCount?: number; durationSeconds?: number; hasAudio?: boolean; sha256?: string }
export interface ValidatedMedia { filename: string; mimeType: string; sizeBytes: number; metadata: MediaMetadata }
export function invalidMedia(): AppError { return new AppError(415, 'CHAT_MEDIA_INVALID', 'Arquivo inválido, corrompido ou formato não suportado.'); }
export function mediaLimit(): AppError { return new AppError(413, 'CHAT_MEDIA_LIMIT', 'O arquivo excede os limites permitidos.'); }
export function safeFilename(name: string): string {
  const basename = path.posix.basename(name.replace(/\\/g, '/'));
  const printable = Array.from(basename).filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('');
  return printable.replace(/[<>"\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 180).trim() || 'anexo';
}

export class ChatMediaValidator {
  private async probe(buffer: Buffer, container: string): Promise<Probe> {
    const output = await nativeMedia('ffprobe', buffer, container, ['-show_streams', '-show_format', '-of', 'json']);
    try { return JSON.parse(output.toString()) as Probe; } catch { throw invalidMedia(); }
  }

  async audio(file: MediaInput): Promise<{ buffer: Buffer; format: 'wav'; silent: boolean; durationSeconds: number }> {
    if (file.buffer.length > 10 * MiB) throw mediaLimit();
    const container = mediaContainer(file.buffer);
    if (!container) throw invalidMedia();
    const probe = await this.probe(file.buffer, container);
    if (!probe.streams?.some(stream => stream.codec_type === 'audio') || probe.streams.some(stream => stream.codec_type === 'video')) throw invalidMedia();
    if (Number(probe.format?.duration) > 180) throw mediaLimit();
    const pcm = await nativeMedia('ffmpeg', file.buffer, container, ['-t', '180.1', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], 6 * MiB);
    const durationSeconds = pcm.length / 32000;
    if (durationSeconds > 180) throw mediaLimit();
    if (!pcm.length) throw invalidMedia();
    let squares = 0;
    for (let i = 0; i < pcm.length - 1; i += 2) squares += pcm.readInt16LE(i) ** 2;
    const silent = Math.sqrt(squares / (pcm.length / 2)) < 32;
    return { buffer: wav(pcm), format: 'wav', silent, durationSeconds };
  }

  private async pdf(file: MediaInput): Promise<ValidatedMedia> {
    if (file.buffer.length > 20 * MiB) throw mediaLimit();
    const directory = await mkdtemp(path.join(tmpdir(), 'chat-pdf-'));
    try {
      const input = path.join(directory, 'input.pdf');
      await writeFile(input, file.buffer, { mode: 0o600 });
      const info = (await runMediaTool('pdfinfo', ['-box', input])).toString();
      const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
      if (!pageCount || !/^Encrypted:\s+no\s*$/m.test(info)) throw invalidMedia();
      if (pageCount > 20) throw mediaLimit();
      const size = info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m);
      if (!size || Number(size[1]) > 14400 || Number(size[2]) > 14400) throw mediaLimit();
      // Decode EVERY page, including image-only scans. Bounded raster size, CPU, AS and file size.
      await runMediaTool('pdftoppm', ['-scale-to', '512', '-f', '1', '-l', String(pageCount), '-png', input, path.join(directory, 'page')]);
      return { filename: safeFilename(file.originalname), mimeType: 'application/pdf', sizeBytes: file.buffer.length, metadata: { pageCount } };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  private async video(file: MediaInput, container: 'mov' | 'matroska'): Promise<ValidatedMedia> {
    if (file.buffer.length > 50 * MiB) throw mediaLimit();
    const probe = await this.probe(file.buffer, container);
    const video = probe.streams?.find(stream => stream.codec_type === 'video');
    if (!video?.width || !video.height) throw invalidMedia();
    if (video.width > 4096 || video.height > 4096 || video.width * video.height > 8_400_000 || Number(probe.format?.duration) > 120) throw mediaLimit();
    const progress = (await nativeMedia('ffmpeg', file.buffer, container, ['-t', '120.1', '-map', '0:v:0', '-map', '0:a?', '-threads', '1', '-filter_threads', '1', '-progress', 'pipe:1', '-f', 'null', '-'])).toString();
    const times = [...progress.matchAll(/^out_time_us=(\d+)/gm)].map(match => Number(match[1]) / 1_000_000);
    const durationSeconds = Math.max(Number(probe.format?.duration) || 0, ...times);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw invalidMedia();
    if (durationSeconds > 120) throw mediaLimit();
    return { filename: safeFilename(file.originalname), mimeType: container === 'mov' ? 'video/mp4' : 'video/webm', sizeBytes: file.buffer.length,
      metadata: { durationSeconds, width: video.width, height: video.height, hasAudio: probe.streams.some(stream => stream.codec_type === 'audio') } };
  }

  async attachment(file: MediaInput): Promise<ValidatedMedia> {
    const { buffer } = file;
    if (buffer.toString('ascii', 0, 5) === '%PDF-') return this.pdf(file);
    const container = mediaContainer(buffer);
    if (container === 'mov' || container === 'matroska') return this.video(file, container);
    const png = buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp) throw invalidMedia();
    if (buffer.length > 10 * MiB) throw mediaLimit();
    try {
      const image = sharp(buffer, { limitInputPixels: 16_000_000, failOn: 'warning' });
      const info = await image.metadata();
      if (!info.width || !info.height || info.width > 8192 || info.height > 8192 || (info.pages ?? 1) !== 1) throw invalidMedia();
      await image.raw().toBuffer();
      return { filename: safeFilename(file.originalname), mimeType: png ? 'image/png' : jpeg ? 'image/jpeg' : 'image/webp', sizeBytes: buffer.length, metadata: { width: info.width, height: info.height } };
    } catch { throw invalidMedia(); }
  }
}
