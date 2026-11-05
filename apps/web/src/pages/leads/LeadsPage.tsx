import { useState } from 'react';
import { Users, MessageCircle, ChevronDown, ChevronLeft, ChevronRight, Check, Copy, Mail, Phone, CalendarDays } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCampaignLeads, type CampaignLead } from '@/hooks/useCampaignLeads';
import { useLeadCampaigns } from '@/hooks/useLeadCampaigns';
import { useLeadStatus, LEAD_STATUS_OPTIONS } from '@/hooks/useLeadStatus';
import { normalizePhoneToMeta } from '@/components/campaign-wizard/lib/phone-format';
import { MetaSyncNotice } from '../../components/MetaSyncNotice';
import { getLatestSync } from '../../lib/format-last-sync';

const PAGE_SIZE = 12;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  novo: 'bg-surface-secondary text-text-secondary border-border',
  'não contatado': 'bg-warning/10 text-warning border-warning/30',
  'tentativa de contato': 'bg-brand/10 text-brand border-brand/30',
  negociando: 'bg-info/10 text-info border-info/30',
  comprou: 'bg-success/10 text-success border-success/30',
  'não comprou': 'bg-error/10 text-error border-error/30',
};

function StatusSelect({ status, name, onSelect }: { status: string; name?: string | null; onSelect: (s: string) => void }) {
  const classes = STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.novo;
  return (
    <div className="relative">
      <select
        aria-label={`Alterar status de ${name ?? 'cliente'}`}
        value={status}
        onChange={(e) => onSelect(e.target.value)}
        className={`w-full cursor-pointer appearance-none rounded-full border py-1.5 pl-3 pr-7 text-xs font-semibold outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/40 ${classes}`}
      >
        {LEAD_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s} className="bg-surface text-text-primary">
            {s}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-current opacity-70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.novo;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${classes}`}>
      {status}
    </span>
  );
}

function CopyButton({ value, label }: { value: string | null; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      title={copied ? 'Copiado!' : `Copiar ${label}`}
      className={`flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        copied ? 'text-success' : 'text-text-tertiary hover:bg-surface-secondary hover:text-text-primary'
      }`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function LeadCard({
  lead,
  showCampaign,
  onStatusChange,
}: {
  lead: CampaignLead;
  showCampaign: boolean;
  onStatusChange: (leadId: string, status: string) => void;
}) {
  const status = lead.status ?? 'novo';
  const email = lead.email ?? '—';

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors duration-200 hover:border-border-light">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand"
        >
          {initials(lead.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate font-medium text-text-primary">{lead.name ?? '—'}</p>
            <CopyButton value={lead.name} label="nome" />
          </div>
          {showCampaign && (
            <p className="truncate text-xs text-text-tertiary" title={lead.campaignName ?? undefined}>
              {lead.campaignName ?? '—'}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-text-primary">
          <Mail className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate" title={email}>{email}</span>
          <CopyButton value={lead.email} label="e-mail" />
        </div>
        <div className="flex items-center gap-2 text-text-primary">
          <Phone className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate whitespace-nowrap">{lead.phone ?? '—'}</span>
          <CopyButton value={lead.phone} label="telefone" />
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <CalendarDays className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate whitespace-nowrap">{formatDate(lead.createdAt)}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          {lead.id ? (
            <StatusSelect status={status} name={lead.name} onSelect={(s) => onStatusChange(lead.id!, s)} />
          ) : (
            <StatusBadge status={status} />
          )}
        </div>
        {lead.phone && (
          <a
            href={`https://wa.me/${normalizePhoneToMeta(lead.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Conversar no WhatsApp com ${lead.name ?? 'o cliente'}`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}

function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const btn =
    'inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-tertiary/50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Paginação de clientes" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-text-tertiary">
        Mostrando {from}–{to} de {total} clientes
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="size-3.5" />
          Anterior
        </button>
        <span className="text-xs text-text-secondary" aria-current="page">
          Página {page} de {totalPages}
        </span>
        <button type="button" className={btn} onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Próxima página">
          Próxima
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Página dedicada de leads de formulário (objetivo 'leads').
 * Filtro por campanha — o dropdown lista apenas campanhas OUTCOME_LEADS
 * (somente elas geram dados de formulário). Padrão: "Todas as campanhas".
 */
export function LeadsPage() {
  const [campaignId, setCampaignId] = useState<string>('');
  const [page, setPage] = useState(1);
  const { campaigns, isLoading: loadingCampaigns, isError: errorCampaigns, degraded: campaignsDegraded, firstSyncPending: campaignsFirstSync, syncedAt: campaignsSyncedAt } = useLeadCampaigns();
  const { leads, isLoading, isError, errorMessage, degraded: leadsDegraded, firstSyncPending: leadsFirstSync, syncedAt: leadsSyncedAt } = useCampaignLeads(
    campaignId || null,
    true,
    campaignId === '',
  );
  const leadStatusMutation = useLeadStatus();

  const onLeadStatusChange = (leadId: string, status: string) => {
    leadStatusMutation.mutate({ id: leadId, status: status as (typeof LEAD_STATUS_OPTIONS)[number] });
  };

  const onSelectCampaign = (id: string) => {
    setCampaignId(id);
    setPage(1);
  };

  const showCampaign = campaignId === '';
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageLeads = leads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const panelClass = 'rounded-2xl border border-border bg-surface';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      <PageHeader
        title="Clientes"
        description="Pessoas que preencheram o formulário dos seus anúncios, buscadas direto do Meta Ads."
      />

      {/* Filtro por campanha de Formulário */}
      <div className="flex items-center gap-2.5">
        <span id="leads-campaign-filter-label" className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Filtrar por campanha
        </span>
        <div className="relative max-w-sm w-full">
          {/* Lista estilizada (o <select> nativo usa a lista do sistema) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={loadingCampaigns}>
              <button
                type="button"
                aria-labelledby="leads-campaign-filter-label"
                className="flex w-full items-center justify-between gap-2 rounded-full border border-border bg-surface px-4 py-3 text-left text-xs sm:text-sm text-text-primary outline-none cursor-pointer hover:border-text-tertiary/50 focus:border-brand transition-all duration-200 disabled:opacity-50"
              >
                <span className="truncate">
                  {campaigns.find((c) => c.id === campaignId)?.name ?? 'Todas as campanhas'}
                </span>
                <ChevronDown className="size-4 shrink-0 text-text-tertiary" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
              {[{ id: '', name: 'Todas as campanhas' }, ...campaigns].map((c) => (
                <DropdownMenuItem key={c.id || 'all'} onSelect={() => onSelectCampaign(c.id)} className="justify-between gap-3">
                  <span className="truncate">{c.name}</span>
                  {c.id === campaignId && <Check className="size-3.5 shrink-0 text-brand" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {errorCampaigns && (
        <div className="rounded-2xl border border-error/20 bg-error-light px-4 py-3.5 text-sm text-error">
          Não foi possível carregar as campanhas. Tente novamente.
        </div>
      )}

      {(campaignsDegraded || leadsDegraded) && <MetaSyncNotice firstSyncPending={campaignsFirstSync || leadsFirstSync} syncedAt={getLatestSync(campaignsSyncedAt, leadsSyncedAt)} />}

      {/* Lista de leads */}
      {isLoading ? (
        <div
          role="status"
          aria-label="Carregando clientes..."
          aria-busy="true"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${panelClass} space-y-4 p-4 animate-pulse`}>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-surface-secondary/80" />
                <div className="h-3 flex-1 rounded bg-surface-secondary/80" />
              </div>
              <div className="h-3 w-3/4 rounded bg-surface-secondary/80" />
              <div className="h-3 w-1/2 rounded bg-surface-secondary/80" />
              <div className="h-7 rounded-full bg-surface-secondary/80" />
            </div>
          ))}
          <span className="sr-only">Carregando clientes...</span>
        </div>
      ) : isError ? (
        <div className={`${panelClass} py-16 px-6 text-sm text-error text-center`}>
          {errorMessage || 'Não foi possível carregar os clientes. Tente novamente.'}
        </div>
      ) : !isLoading && campaigns.length === 0 && !(campaignsFirstSync || leadsFirstSync) ? (
        <div className={panelClass}>
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhuma campanha de Formulário"
            description="Crie uma campanha com o objetivo Formulário para coletar clientes por aqui."
          />
        </div>
      ) : leads.length === 0 && !(campaignsFirstSync || leadsFirstSync) ? (
        <div className={panelClass}>
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhum cliente ainda"
            description="Quando alguém preencher o formulário dos seus anúncios, os contatos aparecerão aqui."
          />
        </div>
      ) : (
        <div className="space-y-5">
          <ul aria-label="Clientes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pageLeads.map((lead, i) => (
              <LeadCard
                key={lead.id ?? `${lead.email ?? 'lead'}-${(currentPage - 1) * PAGE_SIZE + i}`}
                lead={lead}
                showCampaign={showCampaign}
                onStatusChange={onLeadStatusChange}
              />
            ))}
          </ul>
          {leads.length > PAGE_SIZE && (
            <Pagination page={currentPage} totalPages={totalPages} total={leads.length} onChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}
