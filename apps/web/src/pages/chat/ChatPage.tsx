import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Image, Menu, MoreVertical, Pencil, Plus, Trash2, Video, X } from 'lucide-react';
import { ChatRequestError, chatRequest as request } from './chat-request';
import { approvalFailureFromResult } from './approval-outcomes';
import { useChatAttachments } from './useChatAttachments';
import { useChatDictation } from './useChatDictation';
import { useChatPlans } from './useChatPlans';
import { ChatPlanCard } from './ChatPlanCard';
import { ChatComposer } from './ChatComposer';
import { MessageAttachments } from './MessageAttachments';
import type { Attachment } from './chat-media';
import { AdySymbol } from '../../components/AdySymbol';
import './chat.css';

type Message = { id: string; role: string; content: string; created_at?: string | null; attachments?: Attachment[] };
type Conversation = { id: string; title: string; created_at?: string | null };
type Approval = { id: string; action: string; parameters: Record<string, unknown>; status: string; created_at?: string | null; result?: { code?: string; error?: string; imageUrl?: string; videoUrl?: string; jobId?: string; job?: { status?: string; stage?: string; videoUrl?: string; error?: string } } };
const uncertainKey = 'ady-chat-uncertain-approvals';
function uncertainIds(): string[] { try { const value = JSON.parse(sessionStorage.getItem(uncertainKey) || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } }
function rememberUncertain(id: string) { try { sessionStorage.setItem(uncertainKey, JSON.stringify([...new Set([...uncertainIds(), id])])); } catch { /* O estado permanece bloqueado na tela atual. */ } }
function normalizeApprovals(items: Approval[]): Approval[] { const ids = uncertainIds(); return items.map(a => ids.includes(a.id) && a.status === 'pending' ? {...a,status:'unknown'} : a); }

const labels: Record<string, string> = { atual:'Valores atuais', 'alterações':'Alterações propostas', 'observação':'Observação', name:'Nome', dailyBudget:'Orçamento diário', lifetimeBudget:'Orçamento total', objective:'Objetivo', status:'Status', caption:'Legenda', postType:'Tipo de postagem', platform:'Plataforma', date:'Data', scheduledAt:'Agendado para', imageUrl:'Endereço da imagem', videoUrl:'Endereço do vídeo', prompt:'Descrição', model:'Modelo', aspect_ratio:'Proporção', aspectRatio:'Proporção', duration:'Duração', resolution:'Resolução', adAccountId:'Conta de anúncios', version:'Versão', feedback:'Ajuste solicitado' };
function parameterLabel(key: string) { return labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '); }
function displayDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : `${new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo', day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)} (horário de São Paulo; ${value})`; }
function ParameterValues({value, currency}: {value: Record<string, unknown>; currency?: string}) {
  const actual = value.atual && typeof value.atual === 'object' && !Array.isArray(value.atual) ? value.atual as Record<string, unknown> : undefined;
  const confirmedCurrency = typeof value.currency === 'string' ? value.currency : typeof actual?.currency === 'string' ? actual.currency : currency;
  return <dl className="ady-chat-details">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{parameterLabel(key)}</dt><dd>{item !== null && typeof item === 'object' && !Array.isArray(item) ? <ParameterValues value={item as Record<string, unknown>} currency={confirmedCurrency}/> : Array.isArray(item) ? (item.length ? <ul>{item.map((entry, index) => <li key={index}>{entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? <ParameterValues value={entry as Record<string, unknown>} currency={confirmedCurrency}/> : String(entry ?? 'Não informado')}</li>)}</ul> : 'Nenhum') : typeof item === 'number' && ['dailyBudget','lifetimeBudget'].includes(key) ? (confirmedCurrency === 'BRL' ? (item / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'}) : `${item} unidades menores (moeda não confirmada)`) : key === 'scheduledAt' && typeof item === 'string' ? displayDate(item) : typeof item === 'boolean' ? (item ? 'Sim' : 'Não') : String(item ?? 'Não informado')}</dd></div>)}</dl>;
}
function messageDate(value: Message['created_at']) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  // Display the persisted instant in the reader's timezone; never fabricate a send time.
  return {
    day: new Intl.DateTimeFormat('pt-BR', {day:'numeric', month:'long', year:'numeric'}).format(date),
    time: new Intl.DateTimeFormat('pt-BR', {hour:'2-digit', minute:'2-digit'}).format(date),
    full: new Intl.DateTimeFormat('pt-BR', {dateStyle:'long', timeStyle:'long'}).format(date),
  };
}

function timelineTimestamp(value: string | null | undefined) {
  if (!messageDate(value)) return null;
  const timestamp = Date.parse(value!);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function approvalSlots(messages: Message[], approvals: Approval[]) {
  const slots = new Map<number, Approval[]>();
  const ordered = approvals.map((approval, index) => ({approval, index, timestamp:timelineTimestamp(approval.created_at)})).sort((a, b) => {
    if (a.timestamp === null && b.timestamp === null) return a.index - b.index;
    if (a.timestamp === null) return 1;
    if (b.timestamp === null) return -1;
    return a.timestamp - b.timestamp || a.index - b.index;
  });
  for (const {approval, timestamp} of ordered) {
    let slot = messages.length;
    if (timestamp !== null) {
      const responseIndex = messages.findIndex(message => message.role !== 'user' && (timelineTimestamp(message.created_at) ?? -Infinity) >= timestamp);
      if (responseIndex >= 0) slot = responseIndex + 1;
      else {
        let previousIndex = -1;
        for (let index = 0; index < messages.length; index += 1) {
          const messageTimestamp = timelineTimestamp(messages[index].created_at);
          if (messageTimestamp !== null && messageTimestamp <= timestamp) previousIndex = index;
        }
        if (previousIndex >= 0) slot = previousIndex + 1;
        else {
          const nextIndex = messages.findIndex(message => {
            const messageTimestamp = timelineTimestamp(message.created_at);
            return messageTimestamp !== null && messageTimestamp > timestamp;
          });
          if (nextIndex >= 0) slot = nextIndex;
        }
      }
    }
    slots.set(slot, [...(slots.get(slot) || []), approval]);
  }
  return slots;
}

function MessageList({messages, approvals, conversationId, children}: {messages: Message[]; approvals: Approval[]; conversationId:string | null; children: ReactNode}) {
  const cards = new Map<string, ReactNode>();
  const trailing: ReactNode[] = [];
  Children.forEach(children, child => {
    if (!isValidElement<{ 'data-approval-id'?: string }>(child)) { if (child !== null && child !== undefined) trailing.push(child); return; }
    const id = child.props['data-approval-id'];
    if (id) cards.set(id, child);
    else trailing.push(child);
  });
  const slots = approvalSlots(messages, approvals);
  const entries: ReactNode[] = [];
  let previousDay = '';
  for (let slot = 0; slot <= messages.length; slot += 1) {
    for (const approval of slots.get(slot) || []) {
      const card = cards.get(approval.id);
      if (card) entries.push(<Fragment key={`approval:${approval.id}`}>{card}</Fragment>);
    }
    if (slot === messages.length) continue;
    const message = messages[slot];
    const date = messageDate(message.created_at);
    const showDate = date && date.day !== previousDay;
    if (date) previousDay = date.day;
    entries.push(<Fragment key={`message:${message.id}`}>
      {showDate && <div className="ady-chat-date">{date.day}</div>}
      <article className="ady-chat-message" data-role={message.role === 'user' ? 'user' : 'assistant'}>
        <strong>{message.role === 'user' ? 'Você' : 'Ady'}</strong>
        {message.role === 'user' ? <p>{message.content}</p> : <div className="ady-chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{img: () => null, a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{message.content}</ReactMarkdown>
        </div>}
        {conversationId && !!message.attachments?.length && <MessageAttachments conversationId={conversationId} attachments={message.attachments}/>}
        {date && <time className="ady-chat-time" dateTime={message.created_at!} title={date.full} aria-label={date.full}>{date.time}</time>}
      </article>
    </Fragment>);
  }
  return <>{entries}{trailing}</>;
}

export function ChatPage() {
  const selectionVersion = useRef(0);
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  const creatingRequest = useRef<AbortController | null>(null);
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const followLatest = useRef(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [responseRun, setResponseRun] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [sendUncertain, setSendUncertain] = useState(false);
  useEffect(() => () => { selectionVersion.current++; creatingRequest.current?.abort(); }, []);
  const media = useChatAttachments(async () => current || await create());
  const dictation = useChatDictation(text => {
    setInput(draft => draft ? `${draft}${/\s$/.test(draft) ? '' : ' '}${text}` : text);
    inputRef.current?.focus();
  });
  const plans = useChatPlans(current, Boolean(current));
  const composerDisabled = opening || creating || deleting || busy || sendUncertain || approving !== null || responseRun === 'running';
  function resetMedia() { dictation.cancel(); media.clear(); }
  function addFiles(files: File[]) {
    if (composerDisabled || sendingRef.current || creatingRef.current || dictation.active) return;
    void media.add(files);
  }
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const resize = () => {
      const limit = Math.max(44, Math.min(160, window.innerHeight / 4));
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(44, Math.min(textarea.scrollHeight, limit))}px`;
      textarea.style.overflowY = textarea.scrollHeight > limit ? 'auto' : 'hidden';
      if (messagesRef.current && followLatest.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [input]);
  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (container && followLatest.current) container.scrollTop = container.scrollHeight;
  }, [messages, approvals, plans.plans, plans.errors, plans.error, responseRun, busy, error]);
  useEffect(() => {
    const version = selectionVersion.current;
    request('/conversations').then(r => r.json()).then((items: Conversation[]) => {
      // A first message may create/update a conversation before history finishes loading.
      setConversations(existing => [...existing, ...items.filter(item => !existing.some(c => c.id === item.id))]);
      let saved: string | null = null;
      try { saved = sessionStorage.getItem('ady-chat-current'); } catch { /* Sem persistência de aba. */ }
      if (saved && selectionVersion.current === version && items.some(c => c.id === saved)) void open(saved);
    }).catch(() => setError('Não foi possível carregar as conversas.'));
  }, []);
  const hasRunningJob = approvals.some(a => a.result?.jobId && !['done', 'error', 'failed'].includes(a.result?.job?.status || ''));
  useEffect(() => {
    if (!current || (!hasRunningJob && (responseRun !== 'running' || busy))) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const data = await (await request(`/conversations/${current}`)).json(); if (!cancelled) { setApprovals(normalizeApprovals(data.approvals || [])); if (!busy && responseRun === 'running') { setMessages(data.messages || []); setResponseRun(data.response_run?.status || null); } } } catch { if (!cancelled) setError('Não foi possível atualizar o andamento. Tentaremos novamente.'); } finally { if (!cancelled) timer = setTimeout(poll, 3000); } };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current, hasRunningJob, responseRun, busy]);
  async function create() {
    if (creatingRef.current || deletingRef.current) return null;
    creatingRef.current = true; setCreating(true);
    const version = ++selectionVersion.current;
    const controller = new AbortController();
    creatingRequest.current = controller;
    try {
      setError('');
      const c = await (await request('/conversations', {method:'POST',signal:controller.signal})).json();
      if (controller.signal.aborted || version !== selectionVersion.current) return null;
      setConversations(v => [c,...v]); setCurrent(c.id); setSendUncertain(false);
      setHistoryOpen(false);
      followLatest.current = true; setAwayFromLatest(false);
      try { sessionStorage.setItem('ady-chat-current', c.id); } catch { /* Sem persistência de aba. */ }
      setMessages([]); setApprovals([]); setResponseRun(null);
      return c.id as string;
    } catch { if (!controller.signal.aborted) setError('Não foi possível iniciar a conversa.'); return null; }
    finally { creatingRef.current = false; creatingRequest.current = null; setCreating(false); }
  }
  async function open(id: string) {
    if (deletingRef.current) return;
    dictation.cancel();
    if (id !== current) media.clear();
    const version = ++selectionVersion.current;
    setOpening(true);
    try {
      setError('');
      const c = await (await request(`/conversations/${id}`)).json();
      if (selectionVersion.current !== version) return;
      if (media.ready.some(file => c.messages?.some((message: Message) => message.attachments?.some(item => item.id === file.id)))) { setInput(''); media.clear(); }
      setSendUncertain(false);
      if (typeof c.title === 'string') setConversations(items => items.map(item => item.id === id ? {...item, title:c.title} : item));
      setCurrent(id);
      try { sessionStorage.setItem('ady-chat-current', id); } catch { /* Sem persistência de aba. */ }
      followLatest.current = true; setAwayFromLatest(false);
      setMessages(c.messages || []); setApprovals(normalizeApprovals(c.approvals || [])); setResponseRun(c.response_run?.status || null);
    } catch { if (selectionVersion.current === version) setError('Não foi possível abrir a conversa.'); }
    finally { if (selectionVersion.current === version) setOpening(false); }
  }
  async function remove() {
    if (!current || deletingRef.current || busy || sendUncertain || creatingRef.current || sendingRef.current || responseRun === 'running' || media.isBlocked() || !window.confirm('Excluir esta conversa?')) return;
    deletingRef.current = true; setDeleting(true); dictation.cancel();
    try {
      await request(`/conversations/${current}`, {method:'DELETE'});
      media.clear(); setConversations(v => v.filter(c => c.id !== current)); setCurrent(null);
      try { sessionStorage.removeItem('ady-chat-current'); } catch { /* Sem persistência de aba. */ }
      setMessages([]); setApprovals([]); setResponseRun(null); setSendUncertain(false);
    } catch { setError('Não foi possível excluir a conversa.'); }
    finally { deletingRef.current = false; setDeleting(false); }
  }
  async function renameConversation() {
    const id = current;
    const title = titleInput.trim();
    if (!id || !title || savingTitle) return;
    setSavingTitle(true);
    setTitleError('');
    try {
      const saved = await (await request(`/conversations/${id}`, {method:'PATCH', body:JSON.stringify({title})})).json();
      setConversations(items => items.map(item => item.id === id ? {...item, title:saved.title} : item));
      setEditingTitle(false);
    } catch {
      setTitleError('Não foi possível renomear a conversa. Tente novamente.');
    } finally {
      setSavingTitle(false);
    }
  }
  async function approve(id: string) {
    if (approving) return;
    setApproving(id);
    try {
      setError('');
      const outcome = await (await request(`/approvals/${id}/confirm`, {method:'POST'})).json();
      if (!['completed', 'processing'].includes(outcome.status)) throw new Error('incomplete');
      setApprovals(v => v.map(a => a.id === id ? {...a,status:outcome.status,result:outcome.result} : a));
    } catch (err) {
      const failure = err instanceof ChatRequestError ? err.approvalFailure : null;
      if (failure) {
        setApprovals(v => v.map(a => a.id === id ? {...a,status:'failed',result:{code:failure.code,error:failure.message}} : a));
      } else if ((err as {status?: number}).status === 409) {
        setApprovals(v => v.map(a => a.id === id ? {...a,status:'expired'} : a));
        setError('O recurso mudou. Solicite uma nova proposta antes de confirmar.');
      } else {
        rememberUncertain(id);
        setApprovals(v => v.map(a => a.id === id ? {...a,status:'unknown'} : a));
        setError('Não foi possível confirmar a ação.');
      }
    } finally { setApproving(null); void plans.refetch(); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    const attachments = media.ready;
    if ((!text && !attachments.length) || composerDisabled || deletingRef.current || sendingRef.current || media.isBlocked() || dictation.active) return;
    sendingRef.current = true;
    try {
      const id = current || await create();
      if (!id) return;
      await streamResponse(text, id, attachments, () => { setInput(''); media.clear(); });
    } finally { sendingRef.current = false; }
  }
  async function streamResponse(text?: string, conversationId = current, attachments: Attachment[] = [], onAccepted?: () => void) {
    const current = conversationId;
    if (!current || busy) return; setError(''); setBusy(true); setResponseRun(null); const replyId = crypto.randomUUID();
    const isMessage = text !== undefined;
    let accepted = false;
    setMessages(v => [...v, ...(isMessage ? [{id:crypto.randomUUID(),role:'user',content:text || '',attachments}] : []), {id:replyId,role:'assistant',content:''}]);
    try {
      const response = await request(`/conversations/${current}/${isMessage ? 'messages' : 'retry'}`, {method:'POST',body:JSON.stringify(isMessage ? {...(text ? {content:text} : {}), ...(attachments.length ? {attachmentIds:attachments.map(item => item.id)} : {})} : {})});
      accepted = true;
      onAccepted?.();
      if (!response.body) throw new Error('stream ausente');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let completed = false;
      const process = (frame: string) => { const event = frame.split(/\r?\n/).find(x => x.startsWith('event:'))?.slice(6).trim(); const raw = frame.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n'); if (!raw) return; const data = JSON.parse(raw); if (event === 'token') setMessages(v => v.map(m => m.id === replyId ? {...m,content:m.content + data.content} : m)); if (event === 'done') { completed = true; if (typeof data.message?.content === 'string') setMessages(v => v.map(m => m.id === replyId ? {...m, content:data.message.content, created_at:data.message.created_at} : m)); void plans.refetch(); } if (event === 'title' && data.id === current && typeof data.title === 'string') setConversations(items => items.map(item => item.id === current ? {...item, title:data.title} : item)); if (event === 'approval') setApprovals(v => [...v,data]); if (event === 'error') setError(data.message || 'Não foi possível concluir a resposta.'); };
      while (true) { const {value,done} = await reader.read(); buffer += decoder.decode(value, {stream:!done}); const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || ''; frames.forEach(process); if (done) { if (buffer.trim()) process(buffer); break; } }
      if (!completed) throw new Error('stream interrompido');
    } catch {
      try {
        const saved = await (await request(`/conversations/${current}`)).json();
        if (!accepted && attachments.some(file => saved.messages?.some((message: Message) => message.attachments?.some(item => item.id === file.id)))) onAccepted?.();
        if (typeof saved.title === 'string') setConversations(items => items.map(item => item.id === current ? {...item, title:saved.title} : item));
        setMessages(saved.messages || []); setApprovals(normalizeApprovals(saved.approvals || [])); setResponseRun(saved.response_run?.status || null);
        setError('A conexão foi interrompida. A conversa foi atualizada; confira o estado antes de tentar novamente.');
      } catch { setSendUncertain(true); setError('A conexão foi interrompida. Atualize a conversa para recuperar o estado.'); }
    } finally { setBusy(false); }
  }
  const filteredConversations = conversations.filter(c => (c.title || 'Nova conversa').toLocaleLowerCase('pt-BR').includes(historySearch.trim().toLocaleLowerCase('pt-BR')));
  const currentTitle = current ? conversations.find(c => c.id === current)?.title || 'Sua conversa' : 'Nova conversa';
  const history = (<aside id="chat-history" className="ady-chat-history">
<button onClick={() => { resetMedia(); void create(); }} disabled={opening || creating || deleting || busy || approving !== null || savingTitle}>
<Plus size={17} aria-hidden="true"/> Nova conversa</button>
{historyOpen && error && <p role="alert">{error}</p>}
<input className="ady-chat-search" aria-label="Buscar conversas" placeholder="Buscar conversas" value={historySearch} onChange={e => setHistorySearch(e.target.value)}/>
{filteredConversations.length === 0 && <p className="ady-chat-history-empty">{historySearch.trim() ? 'Nenhuma conversa encontrada. Tente outro termo.' : 'Suas conversas ficam salvas aqui. Comece com uma ideia.'}</p>}
<nav aria-label="Histórico de conversas">{filteredConversations.map(c => <button key={c.id} className="ady-chat-conversation" aria-label={c.title || 'Nova conversa'} title={c.title || 'Nova conversa'} onClick={() => { setHistoryOpen(false); setEditingTitle(false); setTitleError(''); void open(c.id); }} disabled={creating || deleting || busy || approving !== null || savingTitle} aria-current={current === c.id ? 'page' : undefined}>
  <span className="ady-chat-avatar" aria-hidden="true"><AdySymbol size={25}/></span>
  <span className="ady-chat-conversation-title">{c.title || 'Nova conversa'}</span>
</button>)}</nav>
</aside>);
  return <DialogPrimitive.Root open={historyOpen} onOpenChange={setHistoryOpen}>
    <div className="ady-chat">
      {!historyOpen && <div className="ady-chat-desktop-history">
<h2>Conversas</h2>{history}</div>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ady-chat-overlay"/>
        <DialogPrimitive.Content className="ady-chat-drawer" aria-describedby={undefined}>
          <div className="ady-chat-drawer-heading">
<DialogPrimitive.Title>Conversas</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Ocultar conversas" aria-expanded={true}>
<X size={20} aria-hidden="true"/>
</DialogPrimitive.Close>
          </div>
          {history}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <section className="ady-chat-main">
<header className="ady-chat-header">      <DialogPrimitive.Trigger asChild>
        <button type="button" className="ady-chat-history-toggle" aria-label="Mostrar conversas">
<Menu size={18} aria-hidden="true"/> Conversas</button>
      </DialogPrimitive.Trigger>
<span className="ady-chat-avatar" aria-hidden="true"><AdySymbol size={29}/></span>
<div className="ady-chat-header-copy">
<div className="ady-chat-identity"><h2>Ady</h2><span>Assistente de IA</span></div>
<p title={currentTitle}>{currentTitle}</p>
</div>
{current && <DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button ref={optionsRef} className="ady-chat-options" type="button" aria-label="Opções da conversa" title="Opções da conversa" disabled={opening || creating || deleting || busy || approving !== null || savingTitle}>
      <MoreVertical size={20} aria-hidden="true"/>
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content className="ady-chat-menu" align="end" sideOffset={8} collisionPadding={12} onCloseAutoFocus={event => { if (editingTitle) event.preventDefault(); }}>
      <DropdownMenu.Item onSelect={() => { setTitleInput(conversations.find(c => c.id === current)?.title || ''); setTitleError(''); setEditingTitle(true); }}>
        <Pencil size={17} aria-hidden="true"/> Renomear conversa
      </DropdownMenu.Item>
      <DropdownMenu.Item className="ady-chat-menu-delete" disabled={media.blocked || sendUncertain || responseRun === 'running'} onSelect={() => void remove()}>
        <Trash2 size={17} aria-hidden="true"/> Excluir conversa
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>}
</header>
<DialogPrimitive.Root open={editingTitle} onOpenChange={next => { if (!savingTitle) { setEditingTitle(next); setTitleError(''); } }}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="ady-chat-overlay"/>
    <DialogPrimitive.Content className="ady-chat-rename-dialog" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); optionsRef.current?.focus(); }}>
      <DialogPrimitive.Title>Renomear conversa</DialogPrimitive.Title>
      <form className="ady-form-plain ady-chat-rename" onSubmit={event => { event.preventDefault(); void renameConversation(); }}>
        <label htmlFor="chat-title">Nome da conversa</label>
        <input id="chat-title" value={titleInput} maxLength={80} onChange={event => setTitleInput(event.target.value)} disabled={savingTitle}/>
        {titleError && <p role="alert">{titleError}</p>}
        <div>
          <DialogPrimitive.Close asChild><button type="button" disabled={savingTitle}>Cancelar</button></DialogPrimitive.Close>
          <button type="submit" disabled={!titleInput.trim() || savingTitle}>{savingTitle ? 'Salvando…' : 'Salvar nome'}</button>
        </div>
      </form>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
<div ref={messagesRef} onScroll={e => { const el = e.currentTarget; const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80; followLatest.current = nearBottom; setAwayFromLatest(!nearBottom); }} className="ady-chat-messages" aria-live="polite">{messages.length === 0 && approvals.length === 0 && plans.plans.length === 0 && <div className="ady-chat-welcome">
<div className="ady-chat-intro">
<h1>Como posso ajudar?</h1>
<p>Conte sua ideia ou escolha uma sugestão para começar.</p>
</div>
<div className="ady-chat-quick">
<button onClick={() => { setInput('Quero criar uma imagem'); inputRef.current?.focus(); }} disabled={opening || busy || creating || responseRun === 'running'}>
<Image size={18} aria-hidden="true"/> Criar imagem</button>
<button onClick={() => { setInput('Quero criar um vídeo'); inputRef.current?.focus(); }} disabled={opening || busy || creating || responseRun === 'running'}>
<Video size={18} aria-hidden="true"/> Criar vídeo</button>
</div>
</div>}<MessageList messages={messages} approvals={approvals} conversationId={current}>{approvals.map(a => <article className="ady-chat-approval" data-status={a.status} data-approval-id={a.id} key={a.id}>
<strong>{a.status === 'pending' ? 'Confirme esta ação' : 'Ação'}: {a.action}</strong>
<ParameterValues value={a.parameters}/>{a.status === 'pending' ? <button onClick={() => approve(a.id)} disabled={opening || deleting || approving !== null}>{approving === a.id ? 'Confirmando…' : 'Confirmar ação'}</button> : approvalFailureFromResult(a.status, a.result) ? <p role="alert">{approvalFailureFromResult(a.status, a.result)?.message}</p> : (['unknown','failed'].includes(a.status) || a.result?.job?.status === 'unknown') ? <p>O resultado não pôde ser confirmado. Verifique o estado da ação antes de tentar novamente.</p> : <p>Status: {a.result?.jobId && !['done','error','failed'].includes(a.result?.job?.status || '') ? 'Em andamento' : ['error','failed'].includes(a.result?.job?.status || '') ? 'Falhou' : a.status === 'completed' ? 'Concluída' : a.status === 'expired' ? 'Expirada' : 'Em andamento'}</p>}{typeof a.result?.imageUrl === 'string' && /^https:\/\//i.test(a.result.imageUrl) && <img src={a.result.imageUrl} alt="Imagem gerada" style={{maxWidth:'100%',borderRadius:12}}/>}{a.result?.jobId && !['done','error','failed','unknown'].includes(a.result?.job?.status || '') && <p>O cancelamento desta geração está indisponível. O vídeo continuará sendo processado.</p>}{['error','failed'].includes(a.result?.job?.status || '') && <p>{a.result?.job?.error === 'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.' ? a.result.job.error : 'Não foi possível concluir o vídeo.'}</p>}{typeof a.result?.job?.videoUrl === 'string' && /^https:\/\//i.test(a.result.job.videoUrl) && <video src={a.result.job.videoUrl} aria-label="Vídeo gerado" controls style={{maxWidth:'100%'}}/>}{typeof a.result?.videoUrl === 'string' && /^https:\/\//i.test(a.result.videoUrl) && <video src={a.result.videoUrl} aria-label="Vídeo gerado" controls style={{maxWidth:'100%'}}/>}</article>)}{plans.plans.map(plan => <ChatPlanCard key={plan.id} plan={plan} busy={plans.busyPlanIds.includes(plan.id)} error={plans.errors[plan.id]} onAction={plans.onAction} onEdit={plans.onEdit} onCompleteTask={plans.onCompleteTask}/> )}</MessageList>{plans.error && <p role="alert">{plans.error}</p>}{!busy && responseRun === 'running' && <p role="status">Aguardando a resposta em andamento…</p>}{!busy && ['failed','interrupted'].includes(responseRun || '') && <button disabled={opening || creating || deleting} onClick={() => streamResponse()}>Retomar resposta</button>}{opening && <p role="status">Carregando conversa…</p>}{creating && <p role="status">Iniciando conversa…</p>}{busy && <p role="status">Ady está respondendo…</p>}{error && <div role="alert">
<p>{error}</p>{current && <button onClick={() => open(current)} disabled={busy}>Atualizar conversa</button>}</div>}</div>
<ChatComposer input={input} onInput={setInput} inputRef={inputRef} onSubmit={send} disabled={composerDisabled} media={media} dictation={dictation} onFiles={addFiles} awayFromLatest={awayFromLatest} onLatest={() => { followLatest.current = true; setAwayFromLatest(false); if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }}/>
</section>
</div>
</DialogPrimitive.Root>;
}
