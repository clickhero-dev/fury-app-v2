import { useState } from 'react';

export type StatsTicket = {
  status: string;
  priority: string | null;
  createdAt: string;
  doneAt?: string | null;
  labels?: string[];
  assignees?: Array<{ id: number; name: string }>;
};

export const STATS_PERIODS = [7, 15, 30] as const;
type Period = (typeof STATS_PERIODS)[number];
const DAY_MS = 86_400_000;

// contagem por chave, maior primeiro
function countBy(items: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/** Números dos chamados a partir das listas do ClickUp; abertos não dependem do período. */
export function computeTicketStats(open: StatsTicket[], resolved: StatsTicket[], days: number, now = Date.now()) {
  const since = now - days * DAY_MS;
  const inPeriod = (iso: string | null | undefined) => Boolean(iso) && Date.parse(iso!) >= since;
  const created = [...open, ...resolved].filter((t) => inPeriod(t.createdAt));
  return {
    open: open.length,
    review: open.filter((t) => t.status.trim().toLocaleLowerCase() === 'homologação').length,
    created: created.length,
    resolved: resolved.filter((t) => inPeriod(t.doneAt)).length,
    urgent: open.filter((t) => t.priority === 'urgent').length,
    high: open.filter((t) => t.priority === 'high').length,
    byLabel: countBy(created.flatMap((t) => t.labels ?? [])),
    byAssignee: countBy(open.flatMap((t) => (t.assignees?.length ? t.assignees.map((a) => a.name) : ['Sem responsável']))),
  };
}

function Card({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</div>
    <div className="mt-1 text-2xl font-bold text-text-primary">{value}</div>
    {hint && <div className="mt-0.5 text-xs text-text-secondary">{hint}</div>}
  </div>;
}

function Breakdown({ title, rows, empty }: { title: string; rows: Array<[string, number]>; empty: string }) {
  return <div className="rounded-xl border border-border bg-surface p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">{title}</div>
    {rows.length === 0
      ? <div className="mt-2 text-sm text-text-secondary">{empty}</div>
      : <ul className="mt-2 space-y-1">
        {rows.slice(0, 6).map(([name, count]) => (
          <li key={name} className="flex items-center justify-between gap-3 text-sm">
            <div className="truncate text-text-primary">{name}</div>
            <strong className="text-text-primary">{count}</strong>
          </li>
        ))}
      </ul>}
  </div>;
}

export function TicketStats({ open, resolved, loading, labelName }: { open: StatsTicket[]; resolved: StatsTicket[]; loading: boolean; labelName: (value: string) => string }) {
  const [days, setDays] = useState<Period>(30);
  const stats = computeTicketStats(open, resolved, days);
  const show = (n: number) => (loading ? '…' : n);

  return <section aria-label="Estatísticas dos chamados" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-text-primary">Visão geral</h2>
      <div role="group" aria-label="Período das estatísticas" className="inline-flex gap-1 rounded-full border border-border bg-surface-secondary p-1">
        {STATS_PERIODS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={`ady-btn rounded-full px-3 py-1 text-xs ${days === d ? 'bg-brand/15 font-semibold text-[#17708A] dark:text-[#1E88A8]' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {d} dias
          </button>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card label="Abertos agora" value={show(stats.open)} hint={loading ? undefined : `${stats.urgent} urgentes · ${stats.high} altos`} />
      <Card label="Em homologação" value={show(stats.review)} hint="aguardando revisão" />
      <Card label="Novos" value={show(stats.created)} hint={`últimos ${days} dias`} />
      <Card label="Resolvidos" value={show(stats.resolved)} hint={`últimos ${days} dias`} />
    </div>
    {!loading && <div className="grid gap-3 md:grid-cols-2">
      <Breakdown title={`Etiquetas dos novos (${days} dias)`} rows={stats.byLabel.map(([k, n]) => [labelName(k), n])} empty="Nenhum chamado novo com etiqueta no período." />
      <Breakdown title="Abertos por responsável" rows={stats.byAssignee} empty="Nenhum chamado aberto." />
    </div>}
  </section>;
}
