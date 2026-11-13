import { FileText, RotateCcw, X } from 'lucide-react';
import { formatBytes } from './chat-media';
import type { useChatAttachments } from './useChatAttachments';

export function DraftAttachments({media, disabled}: {media:ReturnType<typeof useChatAttachments>; disabled:boolean}) {
  if (!media.items.length) return null;
  return <ul className="ady-chat-draft-attachments" aria-label="Anexos da mensagem">{media.items.map(item => <li key={item.key} className="ady-chat-draft-file" data-state={item.status}>
    <div className="ady-chat-file-thumbnail">
      {item.file.type.startsWith('image/') && item.previewUrl ? <img src={item.previewUrl} alt={`Prévia de ${item.file.name}`}/>
        : item.file.type.startsWith('video/') && item.previewUrl ? <video src={item.previewUrl} aria-label={`Prévia de ${item.file.name}`} controls preload="metadata"/>
        : <FileText size={26} aria-hidden="true"/>}
    </div>
    <div className="ady-chat-file-copy"><strong title={item.file.name}>{item.file.name}</strong><small>{formatBytes(item.file.size)}</small>
      {item.status === 'uploading' && <div className="ady-chat-upload-state"><progress aria-label={`Enviando ${item.file.name}`}/><span role="status">Enviando arquivo…</span></div>}
      {item.status === 'ready' && <span className="ady-chat-file-status">Pronto para enviar</span>}
      {item.status === 'removing' && <span role="status">Removendo arquivo…</span>}
      {item.error && <p role="alert">{item.error}</p>}
    </div>
    <div className="ady-chat-file-actions">{item.status === 'failed' && <button type="button" aria-label={`Tentar enviar ${item.file.name} novamente`} title="Tentar novamente" disabled={disabled} onClick={() => void media.retry(item.key)}><RotateCcw size={17} aria-hidden="true"/></button>}
      <button type="button" aria-label={`Remover anexo ${item.file.name}`} title="Remover anexo" disabled={disabled || item.status === 'removing'} onClick={() => void media.remove(item.key)}><X size={18} aria-hidden="true"/></button>
    </div>
  </li>)}</ul>;
}
