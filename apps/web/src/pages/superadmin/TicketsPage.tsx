import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, ExternalLink, RefreshCw, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import api from '@/lib/api';

const ticketSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  subject: z.string().trim().min(3, 'Informe um assunto com pelo menos 3 caracteres.').max(160),
  description: z.string().trim().min(10, 'Descreva o chamado com pelo menos 10 caracteres.').max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  level: z.enum(['N1', 'N2', 'N3', 'N4']),
  assigneeId: z.preprocess((value) => value === '' ? undefined : Number(value), z.number().int().positive().optional()),
});

type TicketForm = z.infer<typeof ticketSchema>;
type CreatedTicket = { clickupTaskId: string; clickupTaskUrl: string };
type TicketApiResponse = { data?: CreatedTicket; error?: { message?: string } };
type Ticket = { id: string; name: string; status: string; priority: string | null; url: string; createdAt: string };
type TicketLists = { open: Ticket[]; resolved: Ticket[] };
type Assignee = { id: number; name: string; email: string | null };

const levelHelp = [
  ['N1 — Orientação simples', 'Dúvida de uso ou ajuste simples, sem bloquear o trabalho.'],
  ['N2 — Problema pontual', 'Algo não funciona para um usuário, mas existe alternativa.'],
  ['N3 — Bloqueio importante', 'Uma função essencial está indisponível ou vários usuários foram afetados.'],
  ['N4 — Crítico', 'A plataforma está indisponível ou há risco de dados e segurança.'],
] as const;

const fieldErrors: Record<keyof TicketForm, { link: string; field: string }> = {
  email: { link: 'E-mail do usuário', field: 'ticket-email' },
  subject: { link: 'Assunto', field: 'ticket-subject' },
  description: { link: 'Descrição', field: 'ticket-description' },
  priority: { link: 'Prioridade', field: 'ticket-priority' },
  level: { link: 'Nível', field: 'ticket-level' },
  assigneeId: { link: 'Responsável', field: 'ticket-assignee' },
};

const statusLabels: Record<string, string> = {
  'aberto': 'Aberto', 'em progresso': 'Em progresso', 'concluído': 'Concluído', 'fechado': 'Fechado',
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

function TicketList({ title, tickets, emptyMessage, loading }: { title: string; tickets: Ticket[]; emptyMessage: string; loading: boolean }) {
  return <section className="rounded-xl border border-[#2A2D27] bg-[#161714] p-5">
    <h2 className="font-semibold">{title} ({tickets.length})</h2>
    {loading ? <p className="mt-3 text-sm text-[#8A8F8B]" aria-busy="true">Carregando chamados…</p> : tickets.length === 0 ? (
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#0C0D0A] px-3 py-2.5">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8A8F8B]" aria-hidden="true" />
        <p className="text-sm text-[#8A8F8B]">{emptyMessage}</p>
      </div>
    ) : <ul className="mt-3 space-y-2">
      {tickets.map((ticket) => {
        const priority = ticket.priority ? priorityStyles[ticket.priority.toLowerCase()] : undefined;
        const age = ticket.createdAt ? formatRelativeDate(ticket.createdAt) : '';
        return <li key={ticket.id} className="rounded-lg bg-[#0C0D0A] px-3 py-2.5 transition-colors hover:bg-[#11120E]">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm font-medium">{ticket.name}</p>
            <a aria-label={`Ver no ClickUp: ${ticket.name}`} href={ticket.url} target="_blank" rel="noreferrer" className="shrink-0 rounded p-1.5 text-[#5cc5e4] transition-colors hover:bg-[#5cc5e4]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8]"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#8A8F8B]">
            <Chip>{statusLabel(ticket.status)}</Chip>
            {priority && <Chip className={priority.chip}>{priority.label}</Chip>}
            {age && <span>{age}</span>}
          </div>
        </li>;
      })}
    </ul>}
  </section>;
}

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return <div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4">
    <p className="text-sm text-[#8A8F8B]">{label}</p>
    {loading ? <div className="mt-2 h-9 w-12 animate-pulse rounded-md bg-[#2A2D27]" aria-hidden="true" /> : <p className="mt-1 text-3xl font-bold">{value}</p>}
  </div>;
}

export function TicketsPage() {
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lists, setLists] = useState<TicketLists>({ open: [], resolved: [] });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [listWarning, setListWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema), defaultValues: { priority: 'normal', level: 'N1', email: '', subject: '', description: '', assigneeId: undefined },
  });
  const descriptionValue = watch('description') ?? '';

  const load = useCallback(async () => {
    setLoading(true); setListWarning(null);
    try {
      const [ticketsResponse, assigneesResponse] = await Promise.all([api.get('/admin/tickets'), api.get('/admin/tickets/assignees')]);
      setLists(ticketsResponse.data.data ?? { open: [], resolved: [] });
      setAssignees(assigneesResponse.data.data ?? []);
      if (ticketsResponse.data.partial_failures?.length) setListWarning('Não foi possível atualizar os chamados agora. Tente novamente.');
    } catch {
      setListWarning('Não foi possível atualizar os chamados agora. Tente novamente.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSubmit = (values: TicketForm) => {
    setSubmitError(null); setCreatedTicket(null);
    void api.post<TicketApiResponse>('/admin/tickets', values).then((response) => {
      const ticket = response.data?.data;
      if (!ticket?.clickupTaskId || !ticket?.clickupTaskUrl) { setSubmitError(response.data?.error?.message ?? 'Não foi possível abrir o ticket agora. Tente novamente.'); return; }
      setCreatedTicket(ticket); reset(); void load();
    }).catch((error: unknown) => setSubmitError((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Não foi possível abrir o ticket agora. Tente novamente.'));
  };

  const fieldClass = 'mt-1 w-full rounded-lg border border-[#2A2D27] bg-[#0C0D0A] px-3 py-2.5 text-sm text-[#ECEDEF] outline-none transition focus:border-[#1E88A8] focus-visible:ring-2 focus-visible:ring-[#1E88A8]/30';
  const errorFor = (name: keyof TicketForm) => errors[name]?.message;
  const summaryEntries = (Object.keys(fieldErrors) as Array<keyof TicketForm>)
    .filter((name) => Boolean(errors[name]?.message))
    .map((name) => ({ name, message: errors[name]?.message as string }));

  return <div className="max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">Chamados</h1>
        <p className="mt-1 text-sm text-[#8A8F8B]">Acompanhe e abra chamados na fila de suporte da Ady.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#2A2D27] px-3 py-2 text-sm transition-colors hover:border-[#3A3D36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {loading ? 'Atualizando…' : 'Atualizar'}
      </button>
    </header>
    <p role="status" aria-busy={loading} className={loading ? 'text-sm text-[#8A8F8B]' : 'sr-only'}>
      {loading ? 'Carregando chamados…' : 'Chamados carregados.'}
    </p>
    {listWarning && <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">{listWarning}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label="Abertos" value={lists.open.length} loading={loading} />
      <StatCard label="Resolvidos" value={lists.resolved.length} loading={loading} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <TicketList title="Abertos" tickets={lists.open} emptyMessage="Nenhum chamado em aberto no momento." loading={loading} />
      <TicketList title="Resolvidos" tickets={lists.resolved} emptyMessage="Nenhum chamado resolvido registrado ainda." loading={loading} />
    </div>
    {createdTicket && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
      <p className="font-medium">Ticket aberto com sucesso.</p>
      <a className="mt-2 inline-flex items-center gap-1 text-[#5cc5e4] underline" href={createdTicket.clickupTaskUrl} target="_blank" rel="noreferrer">Abrir ticket no ClickUp <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
    </div>}
    {submitError && <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">{submitError}</div>}
    <form className="space-y-5 rounded-xl border border-[#2A2D27] bg-[#161714] p-5 sm:p-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className="text-lg font-semibold">Abrir novo chamado</h2>
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
        {errors.email ? <p id="ticket-email-error" className="mt-1 text-xs text-red-300">{errorFor('email')}</p> : <p id="ticket-email-hint" className="sr-only">Informe o e-mail da conta do usuário afetado.</p>}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="ticket-subject">Assunto</label>
        <p className="mt-0.5 text-xs text-[#8A8F8B]">Resumo curto do problema em uma linha (até 160 caracteres).</p>
        <input id="ticket-subject" aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'ticket-subject-error' : undefined} className={fieldClass} maxLength={160} {...register('subject')} />
        {errors.subject && <p id="ticket-subject-error" className="mt-1 text-xs text-red-300">{errorFor('subject')}</p>}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="ticket-description">Descrição</label>
        <textarea id="ticket-description" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'ticket-description-error' : 'ticket-description-counter'} className={`${fieldClass} min-h-36 resize-y`} maxLength={5_000} {...register('description')} />
        {errors.description ? <p id="ticket-description-error" className="mt-1 text-xs text-red-300">{errorFor('description')}</p> : <p id="ticket-description-counter" className="mt-1 text-xs text-[#8A8F8B]"><span aria-live="polite">{descriptionValue.length}/5000</span></p>}
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
            <option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option><option value="N4">N4</option>
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
      <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-[#17708A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E88A8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E88A8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161714] disabled:cursor-not-allowed disabled:opacity-60">
        <Send className="h-4 w-4" aria-hidden="true" />
        {isSubmitting ? 'Abrindo ticket…' : 'Abrir ticket'}
      </button>
    </form>
    <section className="rounded-xl border border-[#2A2D27] bg-[#161714] p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[#5cc5e4]" aria-hidden="true" />
        <h2 className="font-semibold">Como escolher o nível</h2>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {levelHelp.map(([title, description]) => (
          <div key={title} className="rounded-lg bg-[#0C0D0A] px-3 py-2.5">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-[#8A8F8B]">{description}</p>
          </div>
        ))}
      </div>
    </section>
  </div>;
}
