import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, RefreshCw, Send, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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

function TicketList({ title, tickets }: { title: string; tickets: Ticket[] }) {
  return <section className="rounded-xl border border-[#2A2D27] bg-[#161714] p-5">
    <h2 className="font-semibold">{title} ({tickets.length})</h2>
    {tickets.length === 0 ? <p className="mt-3 text-sm text-[#8A8F8B]">Nenhum chamado nesta lista.</p> : <ul className="mt-3 space-y-2">
      {tickets.map((ticket) => <li key={ticket.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#0C0D0A] px-3 py-2.5 text-sm">
        <div className="min-w-0"><p className="truncate font-medium">{ticket.name}</p><p className="mt-0.5 text-xs text-[#8A8F8B]">{ticket.status}{ticket.priority ? ` · ${ticket.priority}` : ''}</p></div>
        <a aria-label={`Ver no ClickUp: ${ticket.name}`} href={ticket.url} target="_blank" rel="noreferrer" className="shrink-0 text-[#5cc5e4] hover:underline"><ExternalLink className="h-4 w-4" /></a>
      </li>)}
    </ul>}
  </section>;
}

export function TicketsPage() {
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lists, setLists] = useState<TicketLists>({ open: [], resolved: [] });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [listWarning, setListWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema), defaultValues: { priority: 'normal', level: 'N1', email: '', subject: '', description: '', assigneeId: undefined },
  });

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
    }).catch((error: any) => setSubmitError(error?.response?.data?.error?.message ?? 'Não foi possível abrir o ticket agora. Tente novamente.'));
  };

  const fieldClass = 'mt-1 w-full rounded-lg border border-[#2A2D27] bg-[#0C0D0A] px-3 py-2.5 text-sm text-[#ECEDEF] outline-none transition focus:border-[#1E88A8]';
  const errorFor = (name: keyof TicketForm) => errors[name]?.message;

  return <div className="max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Chamados</h1><p className="mt-1 text-sm text-[#8A8F8B]">Acompanhe e abra chamados na fila de suporte da Ady.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-[#2A2D27] px-3 py-2 text-sm disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Atualizar</button></header>
    {listWarning && <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">{listWarning}</div>}
    <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4"><p className="text-sm text-[#8A8F8B]">Abertos</p><p className="mt-1 text-3xl font-bold">{lists.open.length}</p></div><div className="rounded-xl border border-[#2A2D27] bg-[#161714] p-4"><p className="text-sm text-[#8A8F8B]">Resolvidos</p><p className="mt-1 text-3xl font-bold">{lists.resolved.length}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-2"><TicketList title="Abertos" tickets={lists.open} /><TicketList title="Resolvidos" tickets={lists.resolved} /></div>
    <section className="rounded-xl border border-[#2A2D27] bg-[#161714] p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#5cc5e4]" /><h2 className="font-semibold">Como escolher o nível</h2></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{levelHelp.map(([title, description]) => <div key={title}><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-[#8A8F8B]">{description}</p></div>)}</div></section>
    {createdTicket && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100"><p className="font-medium">Ticket aberto com sucesso.</p><a className="mt-2 inline-flex items-center gap-1 text-[#5cc5e4] underline" href={createdTicket.clickupTaskUrl} target="_blank" rel="noreferrer">Abrir ticket no ClickUp <ExternalLink className="h-3.5 w-3.5" /></a></div>}
    {submitError && <div role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">{submitError}</div>}
    <form className="space-y-5 rounded-xl border border-[#2A2D27] bg-[#161714] p-5 sm:p-6" onSubmit={handleSubmit(onSubmit)} noValidate><h2 className="font-semibold">Abrir novo chamado</h2>
      <div><label className="text-sm font-medium" htmlFor="ticket-email">E-mail do usuário</label><input id="ticket-email" type="email" autoComplete="email" className={fieldClass} {...register('email')} />{errorFor('email') && <p className="mt-1 text-xs text-red-300">{errorFor('email')}</p>}</div>
      <div><label className="text-sm font-medium" htmlFor="ticket-subject">Assunto</label><input id="ticket-subject" className={fieldClass} maxLength={160} {...register('subject')} />{errorFor('subject') && <p className="mt-1 text-xs text-red-300">{errorFor('subject')}</p>}</div>
      <div><label className="text-sm font-medium" htmlFor="ticket-description">Descrição</label><textarea id="ticket-description" className={`${fieldClass} min-h-36 resize-y`} maxLength={5_000} {...register('description')} />{errorFor('description') && <p className="mt-1 text-xs text-red-300">{errorFor('description')}</p>}</div>
      <div className="grid gap-5 sm:grid-cols-3"><div><label className="text-sm font-medium" htmlFor="ticket-priority">Prioridade</label><select id="ticket-priority" className={fieldClass} {...register('priority')}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div><label className="text-sm font-medium" htmlFor="ticket-level">Nível</label><select id="ticket-level" className={fieldClass} {...register('level')}><option value="N1">N1</option><option value="N2">N2</option><option value="N3">N3</option><option value="N4">N4</option></select></div><div><label className="text-sm font-medium" htmlFor="ticket-assignee">Responsável</label><select id="ticket-assignee" className={fieldClass} {...register('assigneeId')}><option value="">Sem responsável</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select></div></div>
      <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-lg bg-[#1E88A8] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"><Send className="h-4 w-4" /> {isSubmitting ? 'Abrindo ticket…' : 'Abrir ticket'}</button>
    </form>
  </div>;
}
