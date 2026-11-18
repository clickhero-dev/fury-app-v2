import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';

type Connection = {selectedInstagramUserId?: string | null; selectedInstagramUsername?: string | null};
type State = 'loading' | 'disconnected' | 'ready' | 'permission' | 'unknown' | 'multiple';

export function InstagramShare({src, kind, mediaKey}: {src:string; kind:'image'|'video'; mediaKey:string}) {
  const [state, setState] = useState<State>('loading');
  const [username, setUsername] = useState('');
  const [instagramUserId, setInstagramUserId] = useState('');
  const [review, setReview] = useState(false);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [locked, setLocked] = useState(() => !!sessionStorage.getItem(`chat-ig-publish:${mediaKey}`));
  const submitting = useRef(false);
  const check = useCallback(async () => {
    setState('loading');
    try {
      const {data} = await api.get('/meta/connections');
      if (!Array.isArray(data?.data)) throw new Error('invalid connections');
      const connections = (data.data as Connection[]).filter(c => c.selectedInstagramUserId);
      if (!connections.length) { setState('disconnected'); return; }
      if (connections.length > 1) { setState('multiple'); return; }
      setUsername(connections[0].selectedInstagramUsername || connections[0].selectedInstagramUserId || '');
      setInstagramUserId(connections[0].selectedInstagramUserId || '');
      const scopes = await api.get('/meta/scopes');
      if (!Array.isArray(scopes.data?.data?.scopes)) throw new Error('invalid scopes');
      setState(scopes.data.data.scopes.includes('instagram_content_publish') ? 'ready' : 'permission');
    } catch { setState('unknown'); }
  }, []);
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);
  async function publish() {
    if (submitting.current || locked || state !== 'ready') return;
    submitting.current = true; setBusy(true); setMessage('');
    const key = crypto.randomUUID();
    sessionStorage.setItem(`chat-ig-publish:${mediaKey}`, key);
    setLocked(true);
    try {
      const result = await api.post(`/planner/chat-media/${encodeURIComponent(mediaKey)}/publish`, {caption, instagramUserId});
      if (result.data?.data?.status === 'published') setMessage('Publicado com sucesso no Instagram.');
      else setMessage('Não foi possível confirmar a publicação. Verifique o calendário antes de tentar novamente.');
    } catch {
      setMessage('Não foi possível confirmar a publicação. Verifique o calendário antes de tentar novamente.');
    } finally { submitting.current = false; setBusy(false); setReview(false); }
  }
  return <div>
    <button type="button" disabled={state !== 'ready' || locked} onClick={() => setReview(true)}>Compartilhar no Instagram</button>
    {state === 'loading' && <p role="status">Verificando Instagram…</p>}
    {state === 'disconnected' && <a href="/configuracoes/integracoes" target="_blank" rel="noopener noreferrer">Conectar Instagram e dar permissão</a>}
    {state === 'permission' && <p>Permissão de publicação ausente. <a href="/configuracoes/integracoes" target="_blank" rel="noopener noreferrer">Atualize a integração Meta</a>.</p>}
    {state === 'multiple' && <p>Há mais de uma conexão. Selecione a conta em Configurações antes de compartilhar.</p>}
    {state === 'unknown' && <div role="alert">Não foi possível verificar o Instagram. <button type="button" onClick={() => void check()}>Tentar novamente</button></div>}
    {review && createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
      <div role="dialog" aria-modal="true" aria-label="Revisar publicação" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl">
      <p>Publicar {kind === 'image' ? 'imagem' : 'vídeo'} em @{username}?</p>
      {kind === 'image' ? <img src={src} alt="Mídia a publicar" className="my-3 max-h-64 max-w-full object-contain"/> : <video src={src} controls aria-label="Mídia a publicar" className="my-3 max-h-64 max-w-full"/>}
      <label>Legenda<textarea value={caption} maxLength={5000} onChange={event => setCaption(event.target.value)}/></label>
      <button type="button" disabled={busy} onClick={() => setReview(false)}>Cancelar</button>
      <button type="button" disabled={busy || locked} onClick={() => void publish()}>Confirmar publicação</button>
      </div>
    </div>, document.body)}
    {message && <p role="status">{message}</p>}
    {locked && !message && <p>Verifique o calendário para conferir o resultado da publicação anterior.</p>}
  </div>;
}
