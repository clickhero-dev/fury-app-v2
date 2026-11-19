import { AppError } from '../../middleware/errorHandler.js';

/** A posse é verificada separadamente pelo repository; uma origem permitida não basta. */
export function captionMediaAllowed(raw: string, video = false): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (process.env.R2_PUBLIC_URL) {
      const base = new URL(process.env.R2_PUBLIC_URL);
      if (url.origin === base.origin && url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)) return true;
    }
    if (video) return false;
    if (process.env.PUBLIC_BASE_URL && url.origin === new URL(process.env.PUBLIC_BASE_URL).origin && url.pathname.startsWith('/studio-assets/')) return true;
    return /(^|\.)cdninstagram\.com$|(^|\.)fbcdn\.net$/.test(url.hostname);
  } catch { return false; }
}
export function assertCaptionMediaAllowed(url: string, video = false): void {
  if (!captionMediaAllowed(url, video)) throw new AppError(400, 'CAPTION_MEDIA_ORIGIN', 'A origem da mídia não é permitida. Selecione uma mídia da biblioteca ou envie novamente.');
}
