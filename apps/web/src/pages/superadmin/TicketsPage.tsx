import { zodResolver } from '@hookform/resolvers/zod';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, Plus, RefreshCw, Send, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import api from '@/lib/api';

const PAGE_SIZE = 10;
const scopeLabels = [
  ['app', 'App'], ['ux', 'UX'], ['infra', 'Infra'], ['api', 'API'], ['dados', 'Dados'], ['integracoes', 'Integrações'], ['seguranca', 'Segurança'],
] as const;
const areaLabels = [
  ['meta', 'Meta'], ['sincronizacao-dados', 'Sincronização de dados'], ['dados-usuario', 'Dados do usuário'], ['google', 'Google'],
] as const;
const allLabels = [...scopeLabels, ...areaLabels];
type TicketLabel = (typeof allLabels)[number][0];

const ticketSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  subject: z.string().trim().min(3, 'Informe um assunto com pelo menos 3 caracteres.').max(160),
  description: z.string().trim().min(10, 'Descreva o chamado com pelo menos 10 caracteres.').max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  level: z.enum(['N1', 'N2', 'N3', 'N4', 'N5']),
  assigneeId: z.preprocess((value) => value === '' ? undefined : Number(value), z.number().int().positive().optional()),
  labels: z.array(z.enum(allLabels.map(([value]) => value) as [TicketLabel, ...TicketLabel[]])).min(1, 'Selecione ao menos uma etiqueta.').max(4),
}).superRefine(({ labels }, context) => {
  const scopes = labels.filter((label) => scopeLabels.some(([value]) => value === label)).length;
  const areas = labels.filter((label) => areaLabels.some(([value]) => value === label)).length;
  if (scopes < 1 || scopes > 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['labels'], message: 'Selecione uma ou duas etiquetas de escopo.' });
  if (areas > 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ['labels'], message: 'Selecione no máximo duas etiquetas de área.' });
});

type TicketForm = z.infer<typeof ticketSchema>;
type CreatedTicket = { clickupTaskId: string; clickupTaskUrl: string };
type TicketApiResponse = { data?: CreatedTicket; error?: { message?: string } };
type Ticket = { id: string; name: string; status: string; priority: string | null; url: string; createdAt: string; labels?: TicketLabel[] };
type TicketLists = { open: Ticket[]; resolved: Ticket[] };
type Assignee = { id: number; name: string; email: string | null };
type Queue = 'open' | 'resolved';

const levelHelp = [
  ['N1 — Orientação simples', 'Dúvida de uso ou ajuste simples, sem bloquear o trabalho.'],
  ['N2 — Problema pontual', 'Algo não funciona para um usuário, mas existe alternativa.'],
  ['N3 — Bloqueio importante', 'Uma função essencial está indisponível ou vários usuários foram afetados.'],
  ['N4 — Crítico', 'A plataforma está indisponível ou há risco de dados e segurança.'],
  ['N5 — Nova funcionalidade', 'Solicitação de uma nova funcionalidade ou melhoria relevante no produto.'],
] as const;

const fieldErrors: Record<keyof TicketForm, { link: string; field: string }> = {
  email: { link: 'E-mail do usuário', field: 'ticket-email' },
  subject: { link: 'Assunto', field: 'ticket-subject' },
  description: { link: 'Descrição', field: 'ticket-description' },
  priority: { link: 'Prioridade', field: 'ticket-priority' },
  level: { link: 'Nível', field: 'ticket-level' },
  assigneeId: { link: 'Responsável', field: 'ticket-assignee' },
  labels: { link: 'Etiquetas', field: 'ticket-labels' },
};

const statusLabels: Record<string, string> = {
  'aberto': 'Aberto', 'em progresso': 'Em progresso', 'concluído': 'Concluído', 'fechado': 'Fechado', 'pendente': 'Pendente',
};
const priorityStyles: Record<string, { label: string; chip: string }> = {
  low: { label: 'Baixa', chip: 'text-[#9CA3AF] bg-[#9CA3AF]/10' },
  normal: { label: 'Normal', chip: 'text-[#5cc5e4] bg-[#5cc5e4]/10' },
  high: { label: 'Alta', chip: 'text-[#FBBF24] bg-[#FBBF24]/10' },
  urgent: { label: 'Urgente', chip: 'text-[#F87171] bg-[#F87171]/10' },
};

/** Idade relativa em pt-BR ("há 3 dias", "agora"). Fallback vazio quando a data é inválida. */
function formatRelativeDate(isoDate: string, now = new Date()): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = date.getTime() - now.getTime();
  const absSeconds = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (absSeconds < 60) return 'agora';
  if (absSeconds < 3600) return rtf.format(Math.round(diffMs / 60_000), 'minute');
  if (absSeconds < 86_400) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  if (absSeconds < 30 * 86_400) return rtf.format(Math.round(diffMs / 86_400_000), 'day');
  if (absSeconds < 365 * 86_400) return rtf.format(Math.round(diffMs / (30 * 86_400_000)), 'month');
  return rtf.format(Math.round(diffMs / (365 * 86_400_000)), 'year');
}

function statusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return statusLabels[key] ?? (status.trim() ? status.trim().charAt(0).toUpperCase() + status.trim().slice(1) : 'Sem status');
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${className ?? 'bg-[#5cc5e4]/10 text-[#5cc5e4]'}`}>{children}</span>;
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const priority = ticket.priority ? priorityStyles[ticket.priority.toLowerCase()] : undefined;
  const age = ticket.createdAt ? formatRelativeDate(ticket.createdAt) : '';
  return <li className="rounded-lg bg-[#0C0D0A] px-3 py-2.5 transition-colors hover:bg-[#11120E]">
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 break-words text-sm font-medium">{ticket.name}</p>
      <a aria-label={`Ver no ClickUp: ${ticket.name}`} href={ticket.url} target="_blank" rel="noreferrer" className="shrink-0 rounded p-1.5 text-[#5cc5e4] transition-colors hover:bg-[#5cc5e4]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8]"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#8A8F8B]">
      <Chip>{statusLabel(ticket.status)}</Chip>
      {priority && <Chip className={priority.chip}>{priority.label}</Chip>}
      {ticket.labels?.map((label) => <Chip key={label}>{allLabels.find(([value]) => value === label)?.[1] ?? label}</Chip>)}
      {age && <span>{age}</span>}
    </div>
  </li>;
}

const queueLabels: Record<Queue, string> = { open: 'Abertos', resolved: 'Resolvidos' };
const queueEmpty: Record<Queue, string> = {
  open: 'Nenhum chamado em aberto no momento.',
  resolved: 'Nenhum chamado resolvido registrado ainda.',
};

/** Lista única com abas por fila, altura limitada com scroll e paginação local. */
function TicketsTabs({ lists, loading }: { lists: TicketLists; loading: boolean }) {
  const [queue, setQueue] = useState<Queue>('open');
  const [page, setPage] = useState(0);
  const tickets = lists[queue];
  const pageCount = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = tickets.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const selectQueue = (next: Queue) => { setQueue(next); setPage(0); };

  return <section className="rounded-xl border border-[#2A2D27] bg-[#161714]">
    <div role="tablist" aria-label="Filas de chamados" className="flex gap-1 border-b border-[#2A2D27] p-2">
      {(Object.keys(queueLabels) as Queue[]).map((key) => {
        const selected = queue === key;
        return <button
          key={key}
          type="button"
          role="tab"
          id={`tab-${key}`}
          aria-selected={selected}
          aria-controls={`panel-${key}`}
          onClick={() => selectQueue(key)}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] ${
            selected ? 'bg-[#1E88A8]/15 text-[#5cc5e4]' : 'text-[#8A8F8B] hover:bg-[#0C0D0A] hover:text-[#ECEDEF]'
          }`}
        >
          {queueLabels[key]}
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${selected ? 'bg-[#1E88A8]/25 text-[#5cc5e4]' : 'bg-[#0C0D0A] text-[#8A8F8B]'}`}>{loading ? '…' : lists[key].length}</span>
        </button>;
      })}
    </div>
    <div role="tabpanel" id={`panel-${queue}`} aria-labelledby={`tab-${queue}`} className="p-5 pt-4">
      {loading ? <p className="text-sm text-[#8A8F8B]" aria-busy="true">Carregando chamados…</p> : tickets.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-[#0C0D0A] px-3 py-2.5">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8A8F8B]" aria-hidden="true" />
          <p className="text-sm text-[#8A8F8B]">{queueEmpty[queue]}</p>
        </div>
      ) : (
        <>
          <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {visible.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
          </ul>
          {pageCount > 1 && (
            <nav aria-label="Paginação de chamados" className="mt-4 flex items-center justify-between gap-2 text-sm text-[#8A8F8B]">
              <span role="status">Página {safePage + 1} de {pageCount}</span>
              <span className="flex gap-2">
                <button type="button" aria-label="Página anterior" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D27] px-3 py-1.5 transition-colors hover:border-[#3A3D36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior</button>
                <button type="button" aria-label="Próxima página" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="inline-flex items-center gap-1 rounded-lg border border-[#2A2D27] px-3 py-1.5 transition-colors hover:border-[#3A3D36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] disabled:cursor-not-allowed disabled:opacity-40">Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
              </span>
            </nav>
          )}
        </>
      )}
    </div>
  </section>;
}

/** Modal de abertura de chamado (Radix Dialog: focus trap, Esc e lock de scroll de graça). */
function NewTicketDialog({ open, onOpenChange, assignees, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignees: Assignee[];
  onCreated: () => void;
}) {
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema), defaultValues: { priority: 'normal', level: 'N1', email: '', subject: '', description: '', assigneeId: undefined, labels: [] },
  });
  const descriptionValue = watch('description') ?? '';
  const selectedLabels = watch('labels') ?? [];
  const selectedScopes = selectedLabels.filter((label) => scopeLabels.some(([value]) => value === label));
  const selectedAreas = selectedLabels.filter((label) => areaLabels.some(([value]) => value === label));
  const canSubmit = selectedScopes.length >= 1 && selectedScopes.length <= 2 && selectedAreas.length <= 2;

  const handleOpenChange = (next: boolean) => {
    if (next) { setCreatedTicket(null); setSubmitError(null); reset(); }
    onOpenChange(next);
  };

  const onSubmit = (values: TicketForm) => {
    setSubmitError(null); setCreatedTicket(null);
    void api.post<TicketApiResponse>('/admin/tickets', values).then((response) => {
      const ticket = response.data?.data;
      if (!ticket?.clickupTaskId || !ticket?.clickupTaskUrl) { setSubmitError(response.data?.error?.message ?? 'Não foi possível abrir o ticket agora. Tente novamente.'); return; }
      setCreatedTicket(ticket);
      onCreated();
    }).catch((error: unknown) => setSubmitError((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Não foi possível abrir o ticket agora. Tente novamente.'));
  };

  const fieldClass = 'mt-1 w-full rounded-lg border border-[#2A2D27] bg-[#0C0D0A] px-3 py-2.5 text-sm text-[#ECEDEF] outline-none transition focus:border-[#1E88A8] focus-visible:ring-2 focus-visible:ring-[#1E88A8]/30';
  const summaryEntries = (Object.keys(fieldErrors) as Array<keyof TicketForm>)
    .filter((name) => Boolean(errors[name]?.message))
    .map((name) => ({ name, message: errors[name]?.message as string }));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#2A2D27] bg-[#161714] p-5 shadow-xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="text-lg font-semibold">Abrir novo chamado</DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-[#8A8F8B] transition-colors hover:bg-[#0C0D0A] hover:text-[#ECEDEF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8]">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </div>
          {createdTicket && <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-medium">Ticket aberto com sucesso.</p>
            <a className="mt-2 inline-flex items-center gap-1 text-[#5cc5e4] underline" href={createdTicket.clickupTaskUrl} target="_blank" rel="noreferrer">Abrir ticket no ClickUp <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
          </div>}
          {submitError && <div role="alert" className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">{submitError}</div>}
          <form className="mt-5 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            {summaryEntries.length > 0 && (
              <div role="alert" tabIndex={-1} aria-labelledby="ticket-error-title" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
                <h3 id="ticket-error-title" className="font-medium">Revise os campos destacados</h3>
                <ul className="mt-2 list-inside space-y-1">
                  {summaryEntries.map((entry) => (
                    <li key={entry.name}><a href={`#${fieldErrors[entry.name].field}`} className="underline">{fieldErrors[entry.name].link}: {entry.message}</a></li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <label className="text-sm font-medium" htmlFor="ticket-email">E-mail do usuário</label>
              <p className="mt-0.5 text-xs text-[#8A8F8B]">Conta do usuário afetado pelo chamado.</p>
              <input id="ticket-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'ticket-email-error' : 'ticket-email-hint'} className={fieldClass} {...register('email')} />
              {errors.email ? <p id="ticket-email-error" className="mt-1 text-xs text-red-300">{errors.email?.message}</p> : <p id="ticket-email-hint" className="sr-only">Informe o e-mail da conta do usuário afetado.</p>}
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ticket-subject">Assunto</label>
              <p className="mt-0.5 text-xs text-[#8A8F8B]">Resumo curto do problema em uma linha (até 160 caracteres).</p>
              <input id="ticket-subject" aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'ticket-subject-error' : undefined} className={fieldClass} maxLength={160} {...register('subject')} />
              {errors.subject && <p id="ticket-subject-error" className="mt-1 text-xs text-red-300">{errors.subject?.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="ticket-description">Descrição</label>
              <textarea id="ticket-description" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'ticket-description-error' : 'ticket-description-counter'} className={`${fieldClass} min-h-36 resize-y`} maxLength={5_000} {...register('description')} />
              {errors.description ? <p id="ticket-description-error" className="mt-1 text-xs text-red-300">{errors.description?.message}</p> : <p id="ticket-description-counter" className="mt-1 text-xs text-[#8A8F8B]"><span aria-live="polite">{descriptionValue.length}/5000</span></p>}
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium" htmlFor="ticket-priority">Prioridade</label>
                <select id="ticket-priority" className={fieldClass} {...register('priority')}>
                  <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="ticket-level">Nível</label>
                <select id="ticket-level" className={fieldClass} {...register('level')}>
                  <option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option><option value="N4">N4</option><option value="N5">N5 — Nova funcionalidade</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="ticket-assignee">Responsável</label>
                <select id="ticket-assignee" className={fieldClass} {...register('assigneeId')}>
                  <option value="">Sem responsável</option>
                  {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
                </select>
              </div>
            </div>
            <fieldset id="ticket-labels">
              <legend className="text-sm font-medium">Etiquetas</legend>
              <p className="mt-0.5 text-xs text-[#8A8F8B]">Escolha 1–2 de escopo e até duas áreas (máximo 4).</p>
              <div className="mt-3 space-y-3">
                <LabelGroup title="Escopo" labels={scopeLabels} selected={selectedLabels} register={register} />
                <LabelGroup title="Área do playbook" labels={areaLabels} selected={selectedLabels} register={register} />
              </div>
              {selectedAreas.length > 2 && <p className="mt-2 text-xs text-red-300">Selecione no máximo duas etiquetas de área.</p>}
              {(selectedScopes.length === 0 || selectedScopes.length > 2) && <p className="mt-2 text-xs text-red-300">Selecione uma ou duas etiquetas de escopo.</p>}
              {errors.labels && <p className="mt-2 text-xs text-red-300">{errors.labels.message}</p>}
            </fieldset>
            <button type="submit" disabled={isSubmitting || !canSubmit} className="inline-flex items-center gap-2 rounded-lg bg-[#17708A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E88A8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161714] disabled:cursor-not-allowed disabled:opacity-60">
              <Send className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? 'Abrindo ticket…' : 'Abrir ticket'}
            </button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LabelGroup({ title, labels, selected, register }: { title: string; labels: readonly (readonly [TicketLabel, string])[]; selected: TicketLabel[]; register: ReturnType<typeof useForm<TicketForm>>['register'] }) {
  return <div><p className="text-xs font-medium text-[#8A8F8B]">{title}</p><div className="mt-1.5 flex flex-wrap gap-2">
    {labels.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${selected.includes(value) ? 'border-[#1E88A8] bg-[#1E88A8]/15 text-[#5cc5e4]' : 'border-[#2A2D27] text-[#ECEDEF]'}`}>
      <input className="sr-only" type="checkbox" value={value} {...register('labels')} />{label}
    </label>)}
  </div></div>;
}

export function TicketsPage() {
  const [lists, setLists] = useState<TicketLists>({ open: [], resolved: [] });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [listWarning, setListWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ticketsResponse, assigneesResponse] = await Promise.all([api.get('/admin/tickets'), api.get('/admin/tickets/assignees')]);
      setLists(ticketsResponse.data.data ?? { open: [], resolved: [] });
      setAssignees(assigneesResponse.data.data ?? []);
      if (ticketsResponse.data.partial_failures?.length) setListWarning('Não foi possível atualizar os chamados agora. Tente novamente.');
    } catch {
      setListWarning('Não foi possível atualizar os chamados agora. Tente novamente.');
    } finally { setLoading(false); }
  }, []);

  const refresh = useCallback(() => {
    setListWarning(null);
    setLists({ open: [], resolved: [] });
    setAssignees([]);
    void load();
    setLoading(true);
  }, [load]);

  // Carregamento inicial assíncrono: o setState acontece apenas no retorno da promise
  // (não sincronamente no corpo do efeito) — padrão fetch-on-mount do repo.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  return <div className="max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Chamados</h1>
        <p className="mt-1 text-sm text-[#8A8F8B]">Acompanhe e abra chamados na fila de suporte da Ady.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#2A2D27] px-3 py-2 text-sm transition-colors hover:border-[#3A3D36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#17708A] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E88A8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0C0D0A]">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Abrir chamado
        </button>
      </div>
    </header>
    <p role="status" aria-busy={loading} className={loading ? 'text-sm text-[#8A8F8B]' : 'sr-only'}>
      {loading ? 'Carregando chamados…' : 'Chamados carregados.'}
    </p>
    {listWarning && <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">{listWarning}</div>}
    <TicketsTabs lists={lists} loading={loading} />
    <details className="group rounded-xl border border-[#2A2D27] bg-[#161714]">
      <summary className="flex cursor-pointer select-none items-center gap-2 p-5 text-sm font-semibold transition-colors hover:text-[#5cc5e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8]">
        <Users className="h-4 w-4 text-[#5cc5e4]" aria-hidden="true" />
        Como escolher o nível
        <ChevronDown className="ml-auto h-4 w-4 text-[#8A8F8B] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
        {levelHelp.map(([title, description]) => (
          <div key={title} className="rounded-lg bg-[#0C0D0A] px-3 py-2.5">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-[#8A8F8B]">{description}</p>
          </div>
        ))}
      </div>
    </details>
    <NewTicketDialog open={modalOpen} onOpenChange={setModalOpen} assignees={assignees} onCreated={() => void load()} />
  </div>;
}
