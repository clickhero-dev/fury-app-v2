export type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  durationSeconds?: number;
};
const MiB = 1024 * 1024;
const limits: Record<string, number> = {
  'image/jpeg':10 * MiB, 'image/png':10 * MiB, 'image/webp':10 * MiB,
  'application/pdf':20 * MiB, 'video/mp4':50 * MiB, 'video/webm':50 * MiB,
};
export const MEDIA_ACCEPT = Object.keys(limits).join(',');
export const MEDIA_HINT = 'Até 3 arquivos · 60 MB no total. Imagens: 10 MB; PDF: 20 MB e 20 páginas; vídeo: 50 MB e 2 min.';
export function validateFiles(incoming: File[], existing: File[]): string | null {
  if (existing.length + incoming.length > 3) return 'Selecione no máximo 3 arquivos por mensagem.';
  for (const file of incoming) {
    if (!limits[file.type]) return 'Use imagens JPEG, PNG ou WebP, PDF, ou vídeos MP4 e WebM.';
    if (!file.size) return `O arquivo ${file.name} está vazio.`;
    if (file.size > limits[file.type]) return `${file.name} ultrapassa o limite de ${limits[file.type] / MiB} MB.`;
  }
  if ([...existing,...incoming].reduce((total,file) => total + file.size,0) > 60 * MiB) return 'Os arquivos juntos ultrapassam 60 MB.';
  return null;
}
export function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Attachment;
  return typeof item.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
    && typeof item.filename === 'string' && !!item.filename
    && !!limits[item.mimeType] && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0 && item.sizeBytes <= limits[item.mimeType];
}
export function formatBytes(bytes: number) {
  return bytes >= MiB ? `${(bytes / MiB).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB` : `${Math.max(1,Math.ceil(bytes / 1024))} KB`;
}
export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}`;
}
