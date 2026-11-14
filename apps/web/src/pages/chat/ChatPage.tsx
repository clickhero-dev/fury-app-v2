import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Menu, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ChatRequestError, chatRequest as request } from './chat-request';
import { approvalFailureFromResult } from './approval-outcomes';
import { useChatAttachments } from './useChatAttachments';
import { useChatDictation } from './useChatDictation';
import { useChatPlans } from './useChatPlans';
import { ChatPlanCard } from './ChatPlanCard';
import { ChatQuickActions } from './ChatQuickActions';
import { isChatPlanActive } from './chat-plans';
import { ChatComposer } from './ChatComposer';
import { MessageAttachments } from './MessageAttachments';
import type { Attachment } from './chat-media';
import { AdySymbol } from '../../components/AdySymbol';
import { useChatViewport } from './useChatViewport';
import './chat.css';
import './chat-clarifications.css';

type Message = { id: string; role: string; content: string; created_at?: string | null; attachments?: Attachment[] };
type Clarification = {id:string; run_id:string; message_id:string; question:string; choices:string[]; selected_index:number | null; dismissed_at?:string | null};
type ResponseRun = { id: string; user_message_id: string; assistant_message_id?: string | null; status: string; client_key?: string | null };
// Insert persisted messages relative to known IDs without replacing live streams.
function mergeRecoveredMessages(live: Message[], saved: Message[]): Message[] {
  const result = [...live];
  let previous = -1;
  for (let i = 0; i < saved.length; i += 1) {
    const existing = result.findIndex(item => item.id === saved[i].id);
    if (existing >= 0) { previous = existing; continue; }
    const next = saved.slice(i + 1).map(item => result.findIndex(current => current.id === item.id)).find(index => index > previous);
    const position = next ?? (previous + 1);
    result.splice(position, 0, saved[i]);
    previous = position;
  }
  return result;
}
function latestRuns(runs: ResponseRun[]): ResponseRun[] { const seen = new Set<string>(); return runs.filter(run => { if (seen.has(run.user_message_id)) return false; seen.add(run.user_message_id); return true; }); }
function runStatus(runs: ResponseRun[], fallback: string | null): string | null { return runs.length ? (latestRuns(runs).some(run => run.status === 'running') ? 'running' : null) : fallback; }
type Conversation = { id: string; title: string; created_at?: string | null };
type Approval = { id: string; action: string; parameters: Record<string, unknown>; status: string; created_at?: string | null; result?: { code?: string; error?: string; imageUrl?: string; videoUrl?: string; jobId?: string; job?: { status?: string; stage?: string; videoUrl?: string; error?: string } } };
const pendingSendKey = 'ady-chat-pending-sends';
const pendingPayloadKey = 'ady-chat-pending-payloads';
type PendingPayload = { key: string; body: string; path: string };
function readPayload(id: string, key: string): PendingPayload | undefined {
  try { return JSON.parse(sessionStorage.getItem(pendingPayloadKey) || '{}')[id]?.[key]; } catch { return undefined; }
}
function storePayload(id: string, payload: PendingPayload) {
  const stored = JSON.parse(sessionStorage.getItem(pendingPayloadKey) || '{}');
  stored[id] ||= {}; stored[id][payload.key] = payload;
  sessionStorage.setItem(pendingPayloadKey, JSON.stringify(stored));
}
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

function MessageList({messages, approvals, conversationId, clarifications, onChoose, disabled, children}: {messages: Message[]; approvals: Approval[]; conversationId:string | null; clarifications:Clarification[]; onChoose:(item:Clarification, index:number) => void; disabled:boolean; children: ReactNode}) {
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
        {clarifications.filter(item => item.message_id === message.id).map(item => <div key={item.id} className="ady-chat-clarification" role="group" aria-label={item.question}><p>{item.question}</p>{item.choices.map((choice, index) => <button key={index} type="button" disabled={disabled || item.selected_index !== null || !!item.dismissed_at} aria-pressed={item.selected_index === index} onClick={() => onChoose(item, index)}>{choice}</button>)}</div>)}
        {conversationId && !!message.attachments?.length && <MessageAttachments conversationId={conversationId} attachments={message.attachments}/>}
        {date && <time className="ady-chat-time" dateTime={message.created_at!} title={date.full} aria-label={date.full}>{date.time}</time>}
      </article>
    </Fragment>);
  }
  return <>{entries}{trailing}</>;
}

export function ChatPage() {
const pendingSends = useRef(new Map<string, Set<string>>()).current;
function pendingFor(id: string): Set<string> {
  if (!pendingSends.has(id)) {
    try { const stored = JSON.parse(sessionStorage.getItem(pendingSendKey) || '{}'); pendingSends.set(id, new Set(Array.isArray(stored[id]) ? stored[id] : [])); }
    catch { pendingSends.set(id, new Set()); }
  }
  return pendingSends.get(id)!;
}
function markPending(id: string, key: string, pending: boolean) {
  const keys = pendingFor(id); if (pending) keys.add(key); else keys.delete(key);
  try {
    const stored = JSON.parse(sessionStorage.getItem(pendingSendKey) || '{}');
    stored[id] = [...keys]; sessionStorage.setItem(pendingSendKey, JSON.stringify(stored));
    if (!pending) { const payloads = JSON.parse(sessionStorage.getItem(pendingPayloadKey) || '{}'); if (payloads[id]) delete payloads[id][key]; sessionStorage.setItem(pendingPayloadKey, JSON.stringify(payloads)); }
  } catch { /* Retain persisted records if storage becomes unavailable. */ }
}
function reconcilePending(id: string, runs: ResponseRun[], keys: string[] = []) {
  for (const key of keys) markPending(id, key, false);
  for (const run of runs) if (run.client_key) markPending(id, run.client_key, false);
  return pendingFor(id).size > 0;
}

  const selectionVersion = useRef(0);
  const drafts = useRef(new Map<string | null, string>());
  const selectedConversation = useRef<string | null>(null);
  const streamSnapshots = useRef(new Map<string, {messages: Message[]; clarifications: Clarification[]; approvals: Approval[]; responseRun: string | null; runs: ResponseRun[]; error: string; uncertain: boolean; active: boolean; recovered: boolean; concurrent: boolean; nextMessage: number; latestAcceptedMessage: number}>());
  const approvalVersion = useRef(0);
  const sendingRef = useRef(new Set<string>());
  const choosingRef = useRef(new Set<string>());
  const retryingPending = useRef(new Set<string>());
  const activeStreams = useRef(new Map<string, number>());
  const creatingRef = useRef(false);
  const creatingRequest = useRef<AbortController | null>(null);
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  useChatViewport(chatRef);
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
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [responseRun, setResponseRun] = useState<string | null>(null);
  const [responseRuns, setResponseRuns] = useState<ResponseRun[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [, renderDraft] = useState(0);
  const input = drafts.current.get(current) || '';
  function setInput(value: string | ((previous: string) => string)) {
    const previous = drafts.current.get(current) || '';
    drafts.current.set(current, typeof value === 'function' ? value(previous) : value);
    renderDraft(n => n + 1);
  }
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [sendUncertain, setSendUncertain] = useState(false);
  useEffect(() => () => { selectionVersion.current++; creatingRequest.current?.abort(); }, []);
  const media = useChatAttachments(async () => current || await create(true), current);
  const dictation = useChatDictation(text => {
    setInput(draft => draft ? `${draft}${/\s$/.test(draft) ? '' : ' '}${text}` : text);
    inputRef.current?.focus();
  });
  const plans = useChatPlans(current, Boolean(current));
  const composerDisabled = opening || creating || deleting || sendUncertain || approving !== null || (responseRun === 'running' && !busy);

  function addFiles(files: File[]) {
    if (composerDisabled || sendingRef.current.has(current || '') || creatingRef.current || dictation.active) return;
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
  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    // Composer/keyboard changes resize the scrollport without changing messages.
    const observer = new ResizeObserver(() => {
      if (followLatest.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
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
  const hasActivePlan = plans.plans.some(isChatPlanActive);
  useEffect(() => {
    if (!current || (!hasRunningJob && !hasActivePlan && (responseRun !== 'running' || busy))) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { const version = approvalVersion.current; try { const data = await (await request(`/conversations/${current}`)).json(); if (!cancelled && selectedConversation.current === current && version === approvalVersion.current) { const polled = normalizeApprovals(data.approvals || []); const snapshot = streamSnapshots.current.get(current); if (snapshot) { const byId = new Map(polled.map((item: Approval) => [item.id, item])); snapshot.approvals = snapshot.approvals.map(item => byId.get(item.id) as Approval || item); for (const item of polled) if (!snapshot.approvals.some(existing => existing.id === item.id)) snapshot.approvals.push(item); setApprovals(snapshot.approvals); } else setApprovals(polled); if (!busy && responseRun === 'running') { setMessages(data.messages || []); setClarifications(data.clarifications || []); setResponseRun(runStatus(data.response_runs || [], data.response_run?.status || null)); setResponseRuns(data.response_runs || []); } } } catch { if (!cancelled && selectedConversation.current === current) setError('Não foi possível atualizar o andamento. Tentaremos novamente.'); } finally { if (!cancelled && selectedConversation.current === current) timer = setTimeout(poll, 3000); } };
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current, hasRunningJob, hasActivePlan, responseRun, busy]);
  async function create(transferDraft = false) {
    if (creatingRef.current || deletingRef.current) return null;
    creatingRef.current = true; setCreating(true);
    const version = ++selectionVersion.current;
    const controller = new AbortController();
    creatingRequest.current = controller;
    try {
      setError('');
      const c = await (await request('/conversations', {method:'POST',signal:controller.signal})).json();
      if (controller.signal.aborted || version !== selectionVersion.current) return null;
      if (transferDraft && !drafts.current.has(c.id)) {
        drafts.current.set(c.id, drafts.current.get(null) || '');
        drafts.current.delete(null);
        media.transfer(null, c.id);
      }
      setConversations(v => [c,...v]); selectedConversation.current = c.id; setCurrent(c.id); setSendUncertain(false);
      setHistoryOpen(false);
      followLatest.current = true; setAwayFromLatest(false);
      try { sessionStorage.setItem('ady-chat-current', c.id); } catch { /* Sem persistência de aba. */ }
      setMessages([]); setClarifications([]); setApprovals([]); setResponseRun(null); setResponseRuns([]);
      return c.id as string;
    } catch { if (!controller.signal.aborted) setError('Não foi possível iniciar a conversa.'); return null; }
    finally { creatingRef.current = false; creatingRequest.current = null; setCreating(false); }
  }
  async function open(id: string) {
    if (deletingRef.current) return;
    dictation.cancel();
    const version = ++selectionVersion.current;
    setOpening(true);
    try {
      setError('');
      const c = await (await request(`/conversations/${id}`)).json();
      if (selectionVersion.current !== version) return;
      const unresolved = reconcilePending(id, c.response_runs || [], c.client_keys || []);
      setSendUncertain(unresolved);
      if (unresolved) setError('A conexão foi interrompida. Atualize a conversa para recuperar o estado.');
      if (typeof c.title === 'string') setConversations(items => items.map(item => item.id === id ? {...item, title:c.title} : item));
      selectedConversation.current = id; setCurrent(id);
      try { sessionStorage.setItem('ady-chat-current', id); } catch { /* Sem persistência de aba. */ }
      followLatest.current = true; setAwayFromLatest(false);
      const storedSnapshot = streamSnapshots.current.get(id);
      const snapshot = storedSnapshot && !storedSnapshot.active && (storedSnapshot.uncertain || storedSnapshot.recovered) ? undefined : storedSnapshot;
      if (storedSnapshot && !snapshot) streamSnapshots.current.delete(id);
      setMessages(snapshot?.messages ?? c.messages ?? []); setClarifications(snapshot?.clarifications ?? c.clarifications ?? []); setApprovals(snapshot?.approvals ?? normalizeApprovals(c.approvals || [])); setResponseRun(snapshot ? runStatus(snapshot.runs, snapshot.responseRun) : runStatus(c.response_runs || [], c.response_run?.status || null)); setResponseRuns(snapshot?.runs ?? c.response_runs ?? []); setBusy(Boolean(snapshot?.active));
      if (snapshot) { setError(snapshot.error); setSendUncertain(snapshot.uncertain || unresolved); }
      if (snapshot && !snapshot.active) streamSnapshots.current.delete(id);
    } catch { if (selectionVersion.current === version) setError('Não foi possível abrir a conversa.'); }
    finally { if (selectionVersion.current === version) setOpening(false); }
  }
  async function remove() {
    if (!current || deletingRef.current || busy || sendUncertain || creatingRef.current || sendingRef.current.has(current) || responseRun === 'running' || media.isBlocked() || !window.confirm('Excluir esta conversa?')) return;
    deletingRef.current = true; setDeleting(true); dictation.cancel();
    try {
      await request(`/conversations/${current}`, {method:'DELETE'});
      media.clear(current); drafts.current.delete(current); setConversations(v => v.filter(c => c.id !== current)); selectedConversation.current = null; setCurrent(null);
      try { sessionStorage.removeItem('ady-chat-current'); } catch { /* Sem persistência de aba. */ }
      setMessages([]); setClarifications([]); setApprovals([]); setResponseRun(null); setResponseRuns([]); setSendUncertain(false);
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
  function updateVisibleApprovals(update: (items: Approval[]) => Approval[]) {
    const snapshot = current ? streamSnapshots.current.get(current) : undefined;
    if (snapshot) {
      snapshot.approvals = update(snapshot.approvals);
      setApprovals(snapshot.approvals);
    } else setApprovals(update);
  }
  async function approve(id: string) {
    if (approving) return;
    approvalVersion.current++;
    setApproving(id);
    try {
      setError('');
      const outcome = await (await request(`/approvals/${id}/confirm`, {method:'POST'})).json();
      if (!['completed', 'processing'].includes(outcome.status)) throw new Error('incomplete');
      updateVisibleApprovals(v => v.map(a => a.id === id ? {...a,status:outcome.status,result:outcome.result} : a));
    } catch (err) {
      const failure = err instanceof ChatRequestError ? err.approvalFailure : null;
      if (failure) {
        updateVisibleApprovals(v => v.map(a => a.id === id ? {...a,status:'failed',result:{code:failure.code,error:failure.message}} : a));
      } else if ((err as {status?: number}).status === 409) {
        updateVisibleApprovals(v => v.map(a => a.id === id ? {...a,status:'expired'} : a));
        setError('O recurso mudou. Solicite uma nova proposta antes de confirmar.');
      } else {
        rememberUncertain(id);
        updateVisibleApprovals(v => v.map(a => a.id === id ? {...a,status:'unknown'} : a));
        setError('Não foi possível confirmar a ação.');
      }
    } finally { approvalVersion.current++; setApproving(null); void plans.refetch(); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    const attachments = media.ready;
    const key = current || '';
    if ((!text && !attachments.length) || composerDisabled || deletingRef.current || sendingRef.current.has(key) || media.isBlocked() || dictation.active) return;
    sendingRef.current.add(key);
    let released = false;
    try {
      const id = current || await create(true);
      if (!id) return;
      await streamResponse(text, id, attachments, () => {
        sendingRef.current.delete(key);
        released = true;
        if ((drafts.current.get(id) || '').trim() === text) drafts.current.set(id, '');
        media.clear(id, attachments.map(item => item.id));
        renderDraft(n => n + 1);
      });
    } finally { if (!released) sendingRef.current.delete(key); }
  }
  function choose(item: Clarification, index: number) {
    if (!current || item.selected_index !== null || item.dismissed_at || choosingRef.current.has(item.id) || sendUncertain) return;
    choosingRef.current.add(item.id);
    const conversation = current;
    void streamResponse(item.choices[index], conversation, [], undefined, undefined, undefined, {id:item.id, index}).finally(() => choosingRef.current.delete(item.id));
  }
  async function streamResponse(text?: string, conversationId = current, attachments: Attachment[] = [], onAccepted?: () => void, retryRunId?: string, retryPayload?: PendingPayload, selection?: {id:string; index:number}) {
    const current = conversationId;
    if (!current) return;
    if (!selection && retryPayload) {
      const match = retryPayload.path.match(/\/clarifications\/([^/]+)\/answer$/);
      if (match) {
        const index = JSON.parse(retryPayload.body).choiceIndex;
        selection = {id:match[1], index};
        text = clarifications.find(item => item.id === match[1])?.choices[index] ?? '';
      }
    }
    setError(''); setBusy(true); const replyId = crypto.randomUUID(); const userId = crypto.randomUUID();
    const isMessage = text !== undefined;
    const clientKey = retryPayload?.key || crypto.randomUUID();
    const path = retryPayload?.path || (selection ? `/conversations/${current}/clarifications/${selection.id}/answer` : `/conversations/${current}/${isMessage ? 'messages' : `retry${retryRunId ? `?run_id=${encodeURIComponent(retryRunId)}` : ''}`}`);
    const body = retryPayload?.body || JSON.stringify(selection ? {clientKey, responseCapabilities:['multi_message_v1'], choiceIndex:selection.index} : isMessage ? {clientKey, responseCapabilities:['multi_message_v1'], ...(text ? {content:text} : {}), ...(attachments.length ? {attachmentIds:attachments.map(item => item.id)} : {})} : {clientKey, responseCapabilities:['multi_message_v1']});
    try { storePayload(current, {key:clientKey, body, path}); markPending(current, clientKey, true);
      const persisted = JSON.parse(sessionStorage.getItem(pendingSendKey) || '{}');
      const savedPayload = readPayload(current, clientKey);
      if (!Array.isArray(persisted[current]) || !persisted[current].includes(clientKey) || savedPayload?.key !== clientKey || savedPayload.body !== body || savedPayload.path !== path) throw new Error('storage');
    } catch { if (retryPayload) { setSendUncertain(true); } else { markPending(current, clientKey, false); } setBusy(false); setError('Não foi possível salvar o envio com segurança. Verifique o armazenamento do navegador.'); return; }
    const streamSelectionVersion = selectionVersion.current;
    let accepted = false;
    const snapshot = streamSnapshots.current.get(current) || {messages: [...messages], clarifications: [...clarifications], approvals: [...approvals], responseRun, runs: [...responseRuns], error: '', uncertain: false, active: true, recovered: false, concurrent: false, nextMessage: 0, latestAcceptedMessage: 0};
    const messageOrder = isMessage ? ++snapshot.nextMessage : snapshot.nextMessage;
    if (snapshot.active && activeStreams.current.has(current)) snapshot.concurrent = true;
    snapshot.messages = [...snapshot.messages, ...(isMessage ? [{id:userId,role:'user',content:text || '',attachments}] : []), {id:replyId,role:'assistant',content:''}];
    snapshot.active = true;
    activeStreams.current.set(current, (activeStreams.current.get(current) || 0) + 1);
    streamSnapshots.current.set(current, snapshot);
    const visible = () => selectedConversation.current === current;
    const updateMessages = (update: (items: Message[]) => Message[]) => { snapshot.messages = update(snapshot.messages); if (visible()) setMessages(snapshot.messages); };
    const updateApprovals = (update: (items: Approval[]) => Approval[]) => { snapshot.approvals = update(snapshot.approvals); if (visible()) setApprovals(snapshot.approvals); };
    const updateRuns = (runs: ResponseRun[]) => { snapshot.runs = runs; snapshot.responseRun = runStatus(runs, snapshot.responseRun); if (visible()) { setResponseRuns(runs); setResponseRun(snapshot.responseRun); } };
    let runId = retryRunId;
    const updateError = (value: string) => { snapshot.error = value; if (visible()) setError(value); };
    if (visible()) setMessages(snapshot.messages);
    try {
      const response = await request(path, {method:'POST',body});
      accepted = true;
      if (isMessage) snapshot.latestAcceptedMessage = Math.max(snapshot.latestAcceptedMessage, messageOrder);
      if (selection) {
        const chosen = selection;
        snapshot.clarifications = snapshot.clarifications.map(c => c.id === chosen.id ? {...c, selected_index:chosen.index} : c.selected_index === null && !c.dismissed_at ? {...c, dismissed_at:'pending-refresh'} : c);
        if (visible()) setClarifications(snapshot.clarifications);
      } else if (isMessage) {
        snapshot.clarifications = snapshot.clarifications.map(c => c.selected_index === null && !c.dismissed_at ? {...c, dismissed_at:'pending-refresh'} : c);
        if (visible()) setClarifications(snapshot.clarifications);
      }
      onAccepted?.();
      if (!response.body) throw new Error('stream ausente');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let completed = false; let responseText = '';
      const process = (frame: string) => { const event = frame.split(/\r?\n/).find(x => x.startsWith('event:'))?.slice(6).trim(); const raw = frame.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n'); if (!raw) return; const data = JSON.parse(raw); if ((event === 'run' || event === 'done') && typeof data.run_id === 'string' && typeof data.user_message_id === 'string') { runId = data.run_id; markPending(current, clientKey, false); if (isMessage) updateMessages(items => items.some(m => m.id === userId) ? items.filter(m => m.id !== data.user_message_id || m.id === userId).map(m => m.id === userId ? {...m,id:data.user_message_id} : m) : items); const existing = snapshot.runs.find(r => r.id === runId); updateRuns([{...existing,id:runId!,user_message_id:data.user_message_id,status:event === 'done' ? 'completed' : 'running'}, ...snapshot.runs.filter(r => r.id !== runId)]); } if (event === 'token' && typeof data.content === 'string') { responseText += data.content; updateMessages(v => v.map(m => m.id === replyId ? {...m,content:m.content + data.content} : m)); } if (event === 'done') { completed = true; if (data.clarification && typeof data.clarification.id === 'string') { const previous = snapshot.clarifications.find(c => c.id === data.clarification.id); const clarification = {...data.clarification, ...(previous?.selected_index != null ? {selected_index:previous.selected_index} : {}), ...((previous?.dismissed_at || messageOrder < snapshot.latestAcceptedMessage) ? {dismissed_at:previous?.dismissed_at || 'pending-refresh'} : {})}; snapshot.clarifications = [...snapshot.clarifications.filter(c => c.id !== clarification.id), clarification]; if (visible()) setClarifications(snapshot.clarifications); } if (Array.isArray(data.messages) && data.messages.length && data.messages.every((m: Message) => typeof m.id === 'string' && typeof m.content === 'string')) { const received: Message[] = data.messages; responseText = received.map(m => m.content).join('\n'); updateMessages(items => { const ids = new Set(received.map(m => m.id)); const filtered = items.filter(m => m.id === replyId || !ids.has(m.id)); return filtered.flatMap(m => m.id === replyId ? received : [m]); }); } else if (typeof data.message?.content === 'string') { responseText = data.message.content; updateMessages(v => v.filter(m => !data.message.id || m.id !== data.message.id || m.id === replyId).map(m => m.id === replyId ? {...m, id:data.message.id || m.id, content:data.message.content, created_at:data.message.created_at} : m)); } if (visible()) void plans.refetch(); } if (event === 'title' && data.id === current && typeof data.title === 'string') setConversations(items => items.map(item => item.id === current ? {...item, title:data.title} : item)); if (event === 'approval') updateApprovals(v => [...v,data]); if (event === 'error') updateError(data.message || 'Não foi possível concluir a resposta.'); };
      while (true) { const {value,done} = await reader.read(); buffer += decoder.decode(value, {stream:!done}); const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || ''; frames.forEach(process); if (done) { if (buffer.trim()) process(buffer); break; } }
      if (!completed) throw new Error('stream interrompido');
      if (!responseText.trim()) {
        updateMessages(v => v.filter(m => m.id !== replyId));
        updateError('Não foi possível concluir a resposta. Atualize a conversa para conferir o estado.');
      }
    } catch (err) {
      const compacted = !isMessage && err instanceof ChatRequestError && err.status === 409 && err.code === 'retry_compacted';
      const closedClarification = !!selection && err instanceof ChatRequestError && err.status === 409 && err.code === 'clarification_closed';
      if (compacted || closedClarification || (!retryPayload && err instanceof ChatRequestError && err.status >= 400 && err.status < 500 && err.status !== 409)) markPending(current, clientKey, false);
      if (compacted || closedClarification) { snapshot.uncertain = pendingFor(current).size > 0; if (visible()) setSendUncertain(snapshot.uncertain); }
      try {
        const runsBeforeRecovery = new Map(snapshot.runs.map(run => [run.id, run]));
        const clarificationsBeforeRecovery = new Map(snapshot.clarifications.map(item => [item.id, item]));
        const saved = await (await request(`/conversations/${current}`)).json();
        const changedClarifications = snapshot.clarifications.filter(item => clarificationsBeforeRecovery.get(item.id) !== item);
        snapshot.clarifications = [...(saved.clarifications || []).filter((item: Clarification) => !changedClarifications.some(changed => changed.id === item.id)), ...changedClarifications];
        if (visible()) setClarifications(snapshot.clarifications);
        const matchingRun = (saved.response_runs || []).find((run: ResponseRun) => run.client_key === clientKey);
        if ((saved.client_keys || []).includes(clientKey)) { markPending(current, clientKey, false); if (!accepted) { accepted = true; onAccepted?.(); } }
        if (matchingRun) { runId = matchingRun.id; markPending(current, clientKey, false); if (!accepted) { accepted = true; onAccepted?.(); } }
        const unresolved = pendingFor(current).has(clientKey);
        if (unresolved) { snapshot.uncertain = true; if (visible()) setSendUncertain(true); }
        if (typeof saved.title === 'string') setConversations(items => items.map(item => item.id === current ? {...item, title:saved.title} : item));
        if (snapshot.concurrent) {
          updateMessages(items => mergeRecoveredMessages(items.filter(item => item.id !== replyId && (item.id !== userId || !matchingRun)), saved.messages || []));
          updateApprovals(items => [...items, ...normalizeApprovals(saved.approvals || []).filter(item => !items.some(existing => existing.id === item.id))]);
        } else {
          updateMessages(() => saved.messages || []); updateApprovals(() => normalizeApprovals(saved.approvals || []));
        }
        const changedRuns = snapshot.runs.filter(run => run.id !== runId && runsBeforeRecovery.get(run.id) !== run);
        const recoveredRuns: ResponseRun[] = saved.response_runs || [];
        updateRuns([...changedRuns, ...recoveredRuns.filter(run => !changedRuns.some(changed => changed.id === run.id))]); snapshot.responseRun = runStatus(snapshot.runs, saved.response_run?.status || null); snapshot.recovered = !snapshot.concurrent; if (visible()) setResponseRun(snapshot.responseRun);
        updateError(compacted ? 'Não é possível retomar esta resposta após a compactação da conversa. Envie uma nova mensagem.' : closedClarification ? 'Esta pergunta já foi respondida ou ficou obsoleta. A conversa foi atualizada.' : 'A conexão foi interrompida. A conversa foi atualizada; confira o estado antes de tentar novamente.');
      } catch { snapshot.uncertain = true; if (visible()) setSendUncertain(true); updateError('A conexão foi interrompida. Atualize a conversa para recuperar o estado.'); }
    } finally { const remaining = (activeStreams.current.get(current) || 1) - 1; if (remaining) activeStreams.current.set(current, remaining); else activeStreams.current.delete(current); snapshot.active = remaining > 0; if (visible()) { if (!remaining && selectionVersion.current === streamSelectionVersion && streamSnapshots.current.get(current) === snapshot) streamSnapshots.current.delete(current); setBusy(remaining > 0); } }
  }
  const filteredConversations = conversations.filter(c => (c.title || 'Nova conversa').toLocaleLowerCase('pt-BR').includes(historySearch.trim().toLocaleLowerCase('pt-BR')));
  const currentTitle = current ? conversations.find(c => c.id === current)?.title || 'Sua conversa' : 'Nova conversa';
  const history = (<aside id="chat-history" className="ady-chat-history">
<button onClick={() => { dictation.cancel(); void create(true); }} disabled={opening || creating || deleting || busy || approving !== null || savingTitle}>
<Plus size={17} aria-hidden="true"/> Nova conversa</button>
{historyOpen && error && <p role="alert">{error}</p>}
<input className="ady-chat-search" aria-label="Buscar conversas" placeholder="Buscar conversas" value={historySearch} onChange={e => setHistorySearch(e.target.value)}/>
{filteredConversations.length === 0 && <p className="ady-chat-history-empty">{historySearch.trim() ? 'Nenhuma conversa encontrada. Tente outro termo.' : 'Suas conversas ficam salvas aqui. Comece com uma ideia.'}</p>}
<nav aria-label="Histórico de conversas">{filteredConversations.map(c => <button key={c.id} className="ady-chat-conversation" aria-label={c.title || 'Nova conversa'} title={c.title || 'Nova conversa'} onClick={() => { setHistoryOpen(false); setEditingTitle(false); setTitleError(''); void open(c.id); }} disabled={creating || deleting || approving !== null || savingTitle} aria-current={current === c.id ? 'page' : undefined}>
  <span className="ady-chat-avatar" aria-hidden="true"><AdySymbol size={25}/></span>
  <span className="ady-chat-conversation-title">{c.title || 'Nova conversa'}</span>
</button>)}</nav>
</aside>);
  return <DialogPrimitive.Root open={historyOpen} onOpenChange={setHistoryOpen}>
    <div ref={chatRef} className="ady-chat">
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
<div ref={messagesRef} onLoadCapture={() => { if (messagesRef.current && followLatest.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }} onScroll={e => { const el = e.currentTarget; const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80; followLatest.current = nearBottom; setAwayFromLatest(!nearBottom); }} className="ady-chat-messages" aria-live="polite">{messages.length === 0 && approvals.length === 0 && plans.plans.length === 0 && <div className="ady-chat-welcome">
<div className="ady-chat-intro">
<h1>Como posso ajudar?</h1>
<p>Conte sua ideia ou escolha uma sugestão para começar.</p>
</div>
<ChatQuickActions onSelect={prompt => { setInput(prompt); inputRef.current?.focus(); }} disabled={composerDisabled}/>
</div>}<MessageList messages={messages} approvals={approvals} conversationId={current} clarifications={clarifications} onChoose={choose} disabled={opening || deleting || sendUncertain || busy}>{approvals.map(a => <article className="ady-chat-approval" data-status={a.status} data-approval-id={a.id} key={a.id}>
<strong>{a.status === 'pending' ? 'Confirme esta ação' : 'Ação'}: {a.action}</strong>
<ParameterValues value={a.parameters}/>{a.status === 'pending' ? <button onClick={() => approve(a.id)} disabled={opening || deleting || approving !== null}>{approving === a.id ? 'Confirmando…' : 'Confirmar ação'}</button> : approvalFailureFromResult(a.status, a.result) ? <p role="alert">{approvalFailureFromResult(a.status, a.result)?.message}</p> : (['unknown','failed'].includes(a.status) || a.result?.job?.status === 'unknown') ? <p>O resultado não pôde ser confirmado. Verifique o estado da ação antes de tentar novamente.</p> : <p>Status: {a.result?.jobId && !['done','error','failed'].includes(a.result?.job?.status || '') ? 'Em andamento' : ['error','failed'].includes(a.result?.job?.status || '') ? 'Falhou' : a.status === 'completed' ? 'Concluída' : a.status === 'expired' ? 'Expirada' : 'Em andamento'}</p>}{typeof a.result?.imageUrl === 'string' && /^https:\/\//i.test(a.result.imageUrl) && <img src={a.result.imageUrl} alt="Imagem gerada" className="max-w-full rounded-xl"/>}{a.result?.jobId && !['done','error','failed','unknown'].includes(a.result?.job?.status || '') && <p>O cancelamento desta geração está indisponível. O vídeo continuará sendo processado.</p>}{['error','failed'].includes(a.result?.job?.status || '') && <p>{a.result?.job?.error === 'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.' ? a.result.job.error : 'Não foi possível concluir o vídeo.'}</p>}{typeof a.result?.job?.videoUrl === 'string' && /^https:\/\//i.test(a.result.job.videoUrl) && <video src={a.result.job.videoUrl} aria-label="Vídeo gerado" controls className="max-w-full"/>}{typeof a.result?.videoUrl === 'string' && /^https:\/\//i.test(a.result.videoUrl) && <video src={a.result.videoUrl} aria-label="Vídeo gerado" controls className="max-w-full"/>}</article>)}{plans.plans.map(plan => <ChatPlanCard key={plan.id} plan={plan} busy={plans.busyPlanIds.includes(plan.id)} error={plans.errors[plan.id]} onAction={plans.onAction} onEdit={plans.onEdit} onCompleteTask={plans.onCompleteTask}/> )}</MessageList>{plans.error && <p role="alert">{plans.error}</p>}{!busy && responseRun === 'running' && <p role="status">Aguardando a resposta em andamento…</p>}{latestRuns(responseRuns).filter(run => ['failed','interrupted'].includes(run.status)).map(run => <button key={run.id} disabled={opening || creating || deleting || busy || sendUncertain} onClick={() => streamResponse(undefined, current, [], undefined, run.id)}>Retomar resposta{messages.find(message => message.id === run.user_message_id)?.content ? `: ${messages.find(message => message.id === run.user_message_id)?.content}` : ''}</button>)}{!responseRuns.length && !busy && ['failed','interrupted'].includes(responseRun || '') && <button disabled={opening || creating || deleting} onClick={() => streamResponse()}>Retomar resposta</button>}{opening && <p role="status">Carregando conversa…</p>}{creating && <p role="status">Iniciando conversa…</p>}{busy && <p role="status">Ady está respondendo…</p>}{error && <div role="alert">
<p>{error}</p>{current && sendUncertain && Array.from(pendingFor(current)).map(key => { const payload = readPayload(current, key); return payload && <button key={key} disabled={busy} onClick={() => { if (retryingPending.current.has(key)) return; retryingPending.current.add(key); const parsed = JSON.parse(payload.body); void streamResponse(payload.path.includes('/messages') ? parsed.content || '' : undefined, current, [], () => { if ((drafts.current.get(current) || '').trim() === (parsed.content || '')) { drafts.current.set(current, ''); renderDraft(n => n + 1); } media.clear(current, parsed.attachmentIds || []); }, undefined, payload).finally(() => { retryingPending.current.delete(key); if (selectedConversation.current === current) setSendUncertain(pendingFor(current).size > 0); }); }}>Reenviar envio pendente</button>; })}{current && <button onClick={() => open(current)} disabled={busy}>Atualizar conversa</button>}</div>}</div>
<ChatComposer input={input} onInput={setInput} inputRef={inputRef} onSubmit={send} disabled={composerDisabled} media={media} dictation={dictation} onFiles={addFiles} awayFromLatest={awayFromLatest} onLatest={() => { followLatest.current = true; setAwayFromLatest(false); if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }}/>
</section>
</div>
</DialogPrimitive.Root>;
}
