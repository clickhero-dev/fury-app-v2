import { useState } from 'react';
import { Users, MessageCircle, ChevronDown, Check } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCampaignLeads, type CampaignLead } from '@/hooks/useCampaignLeads';
import { useLeadCampaigns } from '@/hooks/useLeadCampaigns';
import { useLeadStatus, LEAD_STATUS_OPTIONS } from '@/hooks/useLeadStatus';
import { normalizePhoneToMeta } from '@/components/campaign-wizard/lib/phone-format';
import { MetaSyncNotice } from '../../components/MetaSyncNotice';
import { getLatestSync } from '../../lib/format-last-sync';

// A página também exporta estas constantes para que o teste valide a mesma classe usada no layout.
export const LEADS_TABLE_MIN_WIDTH_CLASS = 'min-w-[1320px]';
export const LEADS_TABLE_NO_CAMPAIGN_MIN_WIDTH_CLASS = 'min-w-[1110px]';
// eslint-disable-next-line react-refresh/only-export-components
export const LEADS_TABLE_COLUMN_WIDTH_CLASSES = {
  name: 'w-[190px]',
  email: 'w-[270px]',
  phone: 'w-[150px]',
  campaign: 'w-[210px]',
  date: 'w-[200px]',
  status: 'w-[160px]',
  action: 'w-[140px]',
} as const;

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

type LeadColumn = {
  key: keyof CampaignLead;
  label: string;
  thClass?: string;
  render: (value: unknown, row?: CampaignLead) => React.ReactNode;
};

/**
 * Página dedicada de leads de formulário (objetivo 'leads').
 * Filtro por campanha — o dropdown lista apenas campanhas OUTCOME_LEADS
 * (somente elas geram dados de formulário). Padrão: "Todas as campanhas".
 */
export function LeadsPage() {
  const [campaignId, setCampaignId] = useState<string>('');
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

  const showCampaignColumn = campaignId === '';
  const tableMinWidthClass = showCampaignColumn
    ? LEADS_TABLE_MIN_WIDTH_CLASS
    : LEADS_TABLE_NO_CAMPAIGN_MIN_WIDTH_CLASS;

  const columns: LeadColumn[] = [
    {
      key: 'name' as const,
      label: 'Nome',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.name,
      render: (value: unknown) => {
        const name = String(value ?? '—');
        return <span className="block truncate text-text-primary font-medium" title={name}>{name}</span>;
      },
    },
    {
      key: 'email' as const,
      label: 'E-mail',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.email,
      render: (value: unknown) => {
        const email = String(value ?? '—');
        return (
          <span className="block truncate text-text-primary" title={email}>
            {email}
          </span>
        );
      },
    },
    {
      key: 'phone' as const,
      label: 'Telefone',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.phone,
      render: (value: unknown) => {
        const phone = String(value ?? '—');
        return <span className="block truncate text-text-primary whitespace-nowrap" title={phone}>{phone}</span>;
      },
    },
    ...(showCampaignColumn
      ? [{
          key: 'campaignName' as keyof CampaignLead,
          label: 'Campanha',
          thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.campaign,
          render: (value: unknown) => {
            const campaignName = String(value ?? '—');
            return <span className="block truncate text-text-secondary" title={campaignName}>{campaignName}</span>;
          },
        }]
      : []),
    {
      key: 'createdAt' as const,
      label: 'Data',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.date,
      render: (value: unknown) => (
        <span className="block truncate text-text-secondary whitespace-nowrap">{formatDate(value as string | null)}</span>
      ),
    },
    {
      key: 'status' as const,
      label: 'Status',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.status,
      render: (value: unknown, row?: CampaignLead) => {
        const status = (value as string | undefined) ?? 'novo';
        if (!row?.id) {
          return <StatusBadge status={status} />;
        }
        return (
          <StatusSelect
            status={status}
            name={row.name}
            onSelect={(s) => onLeadStatusChange(row.id!, s)}
          />
        );
      },
    },
    {
      key: 'phone' as const,
      label: 'Ação',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.action,
      render: (value: unknown, row: CampaignLead) => {
        const phone = row.phone;
        if (!phone) {
          return <span className="text-text-tertiary">—</span>;
        }
        const wa = `https://wa.me/${normalizePhoneToMeta(phone)}`;
        return (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Conversar no WhatsApp com ${row.name ?? 'o cliente'}`}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
            WhatsApp
          </a>
        );
      },
    },
  ];

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
                <DropdownMenuItem key={c.id || 'all'} onSelect={() => setCampaignId(c.id)} className="justify-between gap-3">
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
      <div className="rounded-2xl border border-border bg-surface transition-all duration-300 hover:border-border-light overflow-x-auto">
        {isLoading ? (
          <div data-testid="leads-table-scroll" className="overflow-x-auto">
            <div
              role="status"
              aria-label="Carregando clientes..."
              aria-busy="true"
              className={`p-4 space-y-2.5 ${tableMinWidthClass}`}
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`grid ${showCampaignColumn ? 'grid-cols-7' : 'grid-cols-6'} gap-4 rounded-xl bg-surface-secondary/40 p-3 animate-pulse`}>
                  {columns.map((column, index) => (
                    <div key={index} className={`h-3 rounded bg-surface-secondary/80 ${column.thClass ?? ''}`} />
                  ))}
                </div>
              ))}
              <span className="sr-only">Carregando clientes...</span>
            </div>
          </div>
        ) : isError ? (
          <div className="py-16 px-6 text-sm text-error text-center">
            {errorMessage || 'Não foi possível carregar os clientes. Tente novamente.'}
          </div>
        ) : !isLoading && campaigns.length === 0 && !(campaignsFirstSync || leadsFirstSync) ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhuma campanha de Formulário"
            description="Crie uma campanha com o objetivo Formulário para coletar clientes por aqui."
          />
        ) : leads.length === 0 && !(campaignsFirstSync || leadsFirstSync) ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhum cliente ainda"
            description="Quando alguém preencher o formulário dos seus anúncios, os contatos aparecerão aqui."
          />
        ) : (
          <div data-testid="leads-table-scroll" className="overflow-x-auto">
            <table className={`w-full table-fixed text-sm ${tableMinWidthClass}`}>
            <thead>
              <tr className="border-b border-border bg-surface-secondary/40">
                {columns.map((col) => (
                  <th key={`${col.key}-${col.label}`} className={`text-left uppercase text-[11px] text-text-tertiary tracking-wider font-semibold py-4 px-4 ${col.thClass ?? ''}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead, i) => (
                <tr key={`${lead.email ?? 'lead'}-${i}`} className="hover:bg-surface-secondary/30 transition-colors">
                  {columns.map((col) => (
                    <td key={`${col.key}-${col.label}`} className={`py-3 px-4 ${col.thClass ?? ''}`}>
                      {col.render(lead[col.key], lead)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
