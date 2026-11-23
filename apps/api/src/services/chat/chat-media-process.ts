import { execFile } from 'node:child_process';
import { AppError } from '../../middleware/errorHandler.js';

/** Fixed executables/arguments only. Never invoke a shell or accept client paths.
 * prlimit bounds native parsers; stdin-only FFmpeg protocols forbid SSRF and local-file dereferencing. */
export async function runMediaTool(tool: 'ffmpeg' | 'ffprobe' | 'pdfinfo' | 'pdftoppm', args: string[], input?: Buffer, maxBuffer = 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile('prlimit', ['--as=1073741824', '--cpu=20', '--nofile=64', '--fsize=16777216', '--', tool, ...args], {
      encoding: 'buffer', timeout: 20_000, killSignal: 'SIGKILL', maxBuffer,
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
    }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 127 as unknown) return reject(new AppError(503, 'CHAT_MEDIA_TOOLS_UNAVAILABLE', 'Validação de mídia indisponível.'));
        if (error.killed) return reject(new AppError(422, 'CHAT_MEDIA_COMPLEX', 'Não foi possível validar este arquivo dentro dos limites.'));
        return reject(new AppError(415, 'CHAT_MEDIA_INVALID', 'Arquivo inválido, corrompido ou formato não suportado.'));
      }
      // Native decoders may return 0 despite corruption; do not silently accept warnings.
      if (stderr.length) return reject(new AppError(415, 'CHAT_MEDIA_INVALID', 'Arquivo inválido, corrompido ou formato não suportado.'));
      resolve(stdout);
    });
    child.stdin?.on('error', () => { /* exit callback owns the sanitized error */ });
    child.stdin?.end(input);
  });
}
