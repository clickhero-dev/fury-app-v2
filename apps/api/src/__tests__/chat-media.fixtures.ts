import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';

/** Real PDF Standard Security Handler revision 2, synthetic password; no library/runtime dependency. */
export function syntheticEncryptedPdf(): Buffer {
  const padding = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
  const padded = (password: string) => Buffer.concat([Buffer.from(password), padding]).subarray(0, 32);
  const md5 = (value: Buffer) => createHash('md5').update(value).digest();
  const rc4 = (key: Buffer, input: Buffer) => {
    const s = Array.from({ length: 256 }, (_, index) => index); let j = 0;
    for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) % 256; [s[i], s[j]] = [s[j], s[i]]; }
    let i = 0; j = 0;
    return Buffer.from(input.map(byte => { i = (i + 1) % 256; j = (j + s[i]) % 256; [s[i], s[j]] = [s[j], s[i]]; return byte ^ s[(s[i] + s[j]) % 256]; }));
  };
  const owner = rc4(md5(padded('synthetic-owner')).subarray(0, 5), padded('synthetic-test'));
  const documentId = Buffer.alloc(16, 1); const permissions = Buffer.from('fcffffff', 'hex');
  const key = md5(Buffer.concat([padded('synthetic-test'), owner, permissions, documentId])).subarray(0, 5);
  const user = rc4(key, padding);
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>', `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >>`];
  let result = '%PDF-1.4\n'; const offsets: number[] = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 5\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<${documentId.toString('hex')}> <${documentId.toString('hex')}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function syntheticSeekableMp4(): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), 'chat-video-fixture-'));
  const output = path.join(directory, 'fixture.mp4');
  try {
    await new Promise<void>((resolve, reject) => execFile('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x480:r=10', '-t', '3', '-c:v', 'libx264', '-threads', '1', '-f', 'mp4', output], { timeout: 10000 }, error => error ? reject(error) : resolve()));
    return await readFile(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Preserve WebM framing but invalidate an actual Opus packet (RFC 6716: >120ms). */
export async function corruptSyntheticOpusPacket(buffer: Buffer): Promise<Buffer> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = execFile('ffprobe', ['-v', 'error', '-fflags', '+noparse+nofillin', '-f', 'matroska', '-i', 'pipe:0', '-select_streams', 'a:0', '-show_packets', '-show_entries', 'packet=pos', '-of', 'json'], { timeout: 10000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin!.end(buffer);
  });
  const packets = (JSON.parse(output) as { packets: Array<{ pos: string }> }).packets;
  const position = Number(packets[Math.floor(packets.length / 2)]?.pos);
  // Our synthetic single-track blocks have a one-byte track ID and no lacing.
  if (!Number.isInteger(position) || !(buffer[position] & 0x80) || (buffer[position + 3] & 6)) throw new Error('Unexpected synthetic WebM block');
  const corrupt = Buffer.from(buffer);
  corrupt[position + 4] = 0xfb; // CELT 20ms, arbitrary frame count (code 3).
  corrupt[position + 5] = 0x3f; // 63 frames = 1260ms, impossible Opus packet.
  return corrupt;
}

// Synthetic fixtures only: no customer file, no network, no DB credentials.
export function syntheticPdf(pages = 1, image?: Buffer): Buffer {
  const contents = image ? Buffer.from('q 100 0 0 100 0 0 cm /Im0 Do Q') : Buffer.from('BT /F1 12 Tf 20 80 Td (TESTE AZUL 42) Tj ET');
  const objects: Buffer[] = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>')];
  objects.push(Buffer.from(`<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pages} >>`));
  for (let i = 0; i < pages; i++) objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 ${pages + 4} 0 R >> ${image ? `/XObject << /Im0 ${pages + 5} 0 R >>` : ''} >> /Contents ${pages + 3} 0 R >>`));
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${contents.length} >>\nstream\n`), contents, Buffer.from('\nendstream')]));
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  if (image) objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]));
  let result = Buffer.from('%PDF-1.4\n'); const offsets = [0];
  objects.forEach((object, i) => { offsets.push(result.length); result = Buffer.concat([result, Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]); });
  const xref = result.length;
  return Buffer.concat([result, Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)]);
}
export async function syntheticMedia(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'error', '-threads', '1', '-filter_threads', '1', ...args, 'pipe:1'], { encoding: 'buffer', timeout: 10000, maxBuffer: 12 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      // FFmpeg's non-seekable WAV header uses unknown lengths. Finalize this synthetic file.
      if (stdout.toString('ascii', 0, 4) === 'RIFF' && stdout.toString('ascii', 8, 12) === 'WAVE') {
        stdout.writeUInt32LE(stdout.length - 8, 4);
        const data = stdout.indexOf(Buffer.from('data'));
        if (data >= 0) stdout.writeUInt32LE(stdout.length - data - 8, data + 4);
      }
      resolve(stdout);
    });
  });
}
