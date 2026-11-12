import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { MEDIA_ACCEPT, MEDIA_HINT, formatDuration } from './chat-media';
import { DraftAttachments } from './DraftAttachments';
import type { useChatAttachments } from './useChatAttachments';
import type { useChatDictation } from './useChatDictation';

type Props = {
  input:string;
  onInput:(text:string) => void;
  inputRef:RefObject<HTMLTextAreaElement | null>;
  onSubmit:(event:FormEvent) => void;
  disabled:boolean;
  media:ReturnType<typeof useChatAttachments>;
  dictation:ReturnType<typeof useChatDictation>;
  onFiles:(files:File[]) => void;
  awayFromLatest:boolean;
  onLatest:() => void;
};
export function ChatComposer({input,onInput,inputRef,onSubmit,disabled,media,dictation,onFiles,awayFromLatest,onLatest}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging,setDragging] = useState(false);
  const canAdd = !disabled && !dictation.active;
  return <div className="ady-chat-composer-area" data-dragging={dragging || undefined}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (canAdd) setDragging(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (canAdd) onFiles(Array.from(event.dataTransfer.files)); }}>
    {awayFromLatest && <button className="ady-chat-latest" aria-label="Mensagens recentes" type="button" onClick={onLatest}>Mensagens recentes ↓</button>}
    <DraftAttachments media={media} disabled={disabled}/>
    {media.error && <p role="alert">{media.error}</p>}
    {dictation.error && <p role="alert">{dictation.error}</p>}
    {dictation.active && <div className="ady-chat-dictation">
      <div role="status">{dictation.status === 'recording' ? 'Gravando' : dictation.status === 'requesting' ? 'Aguardando permissão do microfone…' : 'Transcrevendo áudio…'}
        {dictation.status === 'recording' && <> <time aria-label="Duração da gravação">{formatDuration(dictation.seconds)}</time><span className="ady-chat-record-limit"> / 03:00</span></>}
      </div>
      <button type="button" className="ady-chat-media-action" aria-label="Cancelar gravação" title="Cancelar gravação" onClick={dictation.cancel}><X size={20} aria-hidden="true"/></button>
    </div>}
    <form className="ady-form-plain ady-chat-composer" onSubmit={onSubmit} aria-busy={disabled || media.blocked || dictation.active}>
      <label className="ady-chat-sr-only" htmlFor="chat-message">Sua mensagem</label>
      <input ref={fileInput} type="file" className="ady-chat-sr-only" aria-label="Selecionar anexos" aria-describedby="chat-media-hint" accept={MEDIA_ACCEPT} multiple disabled={!canAdd} tabIndex={-1} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (canAdd) onFiles(files); }}/>
      <div className="ady-chat-input-shell">
        <button className="ady-chat-media-action" type="button" aria-label="Anexar arquivos" title={MEDIA_HINT} aria-describedby="chat-media-hint" disabled={!canAdd || media.items.length >= 3} onClick={() => fileInput.current?.click()}><Paperclip size={20} aria-hidden="true"/></button>
        <textarea ref={inputRef} id="chat-message" rows={1} aria-label="Mensagem" aria-describedby="chat-composer-hint" value={input} onChange={event => onInput(event.target.value)}
          onPaste={event => { const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length && canAdd) { event.preventDefault(); onFiles(files); } }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Digite uma mensagem…" disabled={disabled}/>
        {dictation.status === 'recording' ? <button className="ady-chat-media-action ady-chat-record-stop" type="button" aria-label="Parar gravação" title="Parar e transcrever" onClick={dictation.stop}><Square size={18} aria-hidden="true"/></button>
          : <button className="ady-chat-media-action" type="button" aria-label="Gravar mensagem" title="Ditar mensagem (até 3 minutos)" disabled={disabled || dictation.active || media.blocked} onClick={() => void dictation.start()}><Mic size={20} aria-hidden="true"/></button>}
      </div>
      <button className="ady-chat-send" type="submit" aria-label="Enviar mensagem" title="Enviar mensagem" disabled={disabled || dictation.active || media.blocked || (!input.trim() && !media.ready.length)}><Send size={20} aria-hidden="true"/></button>
    </form>
    <p id="chat-composer-hint" className="ady-chat-composer-hint">Enter para enviar · Shift + Enter para nova linha</p>
    <p id="chat-media-hint" className="ady-chat-sr-only">{MEDIA_HINT} A gravação vira texto para revisar antes de enviar.</p>
    {dragging && <span className="ady-chat-drop-hint">Solte os arquivos para anexar</span>}
  </div>;
}
