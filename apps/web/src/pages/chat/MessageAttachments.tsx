import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Film, Image as ImageIcon } from 'lucide-react';
import { chatRequest, mediaError } from './chat-request';
import { formatBytes, formatDuration, isAttachment, type Attachment } from './chat-media';

function PrivateAttachment({conversationId, attachment}: {conversationId:string; attachment:Attachment}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const resource = useRef<{url?:string; request?:AbortController; timeout?:ReturnType<typeof setTimeout>}>({});
  useEffect(() => () => { clearTimeout(resource.current.timeout); resource.current.request?.abort(); if (resource.current.url) URL.revokeObjectURL(resource.current.url); }, []);
  async function preview() {
    if (resource.current.request || resource.current.url) return;
    const controller = new AbortController();
    resource.current.request = controller;
    setLoading(true); setError('');
    const timeout = setTimeout(() => {
      if (resource.current.request !== controller || controller.signal.aborted) return;
      controller.abort(); resource.current.request = undefined;
      setLoading(false); setError('O arquivo demorou demais para abrir. Tente novamente.');
    },60000);
    resource.current.timeout = timeout;
    try {
      const response = await chatRequest(`/conversations/${conversationId}/attachments/${attachment.id}`,{signal:controller.signal});
      if (controller.signal.aborted) return;
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      // The metadata contract is allowlisted. Do not render arbitrary remote URLs or HTML.
      if (!blob.size || (blob.type && blob.type.split(';')[0] !== attachment.mimeType)) throw new Error('invalid preview');
      const objectUrl = URL.createObjectURL(blob);
      resource.current.url = objectUrl;
      setUrl(objectUrl);
    } catch (err) { if (!controller.signal.aborted) setError(mediaError(err,'preview')); }
    finally { clearTimeout(timeout); if (resource.current.request === controller && !controller.signal.aborted) { resource.current.request = undefined; setLoading(false); } }
  }
  const image = attachment.mimeType.startsWith('image/');
  const video = attachment.mimeType.startsWith('video/');
  const Icon = image ? ImageIcon : video ? Film : FileText;
  return <div className="ady-chat-saved-attachment">
    <div className="ady-chat-file-summary"><Icon size={20} aria-hidden="true"/><div><strong>{attachment.filename}</strong><small>{formatBytes(attachment.sizeBytes)}{attachment.pageCount ? ` · ${attachment.pageCount} páginas` : ''}{attachment.durationSeconds ? ` · ${formatDuration(attachment.durationSeconds)}` : ''}</small></div></div>
    {url ? <>
      {image && <img src={url} alt={attachment.filename}/>}
      {video && <video src={url} aria-label={attachment.filename} controls preload="metadata"/>}
      <a href={url} download={attachment.filename} aria-label={`Baixar ${attachment.filename}`}><Download size={16} aria-hidden="true"/>Baixar arquivo</a>
    </> : <button type="button" aria-label={`Visualizar ${attachment.filename}`} onClick={() => void preview()} disabled={loading}><Eye size={16} aria-hidden="true"/>Visualizar</button>}
    {loading && <span role="status" aria-label={`Abrindo ${attachment.filename}`}>Abrindo arquivo…</span>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function MessageAttachments({conversationId, attachments}: {conversationId:string; attachments:Attachment[]}) {
  return <div className="ady-chat-saved-attachments">{attachments.filter(isAttachment).map(attachment => <PrivateAttachment key={`${conversationId}:${attachment.id}`} conversationId={conversationId} attachment={attachment}/>)}</div>;
}
