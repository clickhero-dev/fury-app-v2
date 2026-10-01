import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Users, MessageCircle } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components';
import { useCampaignLeads, type CampaignLead } from '@/hooks/useCampaignLeads';
import { useLeadCampaigns } from '@/hooks/useLeadCampaigns';
import { useLeadStatus, LEAD_STATUS_OPTIONS } from '@/hooks/useLeadStatus';
import { normalizePhoneToMeta } from '@/components/campaign-wizard/lib/phone-format';
import { MetaSyncNotice } from '../../components/MetaSyncNotice';
import { getLatestSync } from '../../lib/format-last-sync';

// Mantém as colunas legíveis e faz o cartão oferecer rolagem em telas menores.
export const LEADS_TABLE_MIN_WIDTH_CLASS = 'min-w-[1320px]';
export const LEADS_TABLE_NO_CAMPAIGN_MIN_WIDTH_CLASS = 'min-w-[1110px]';
// eslint-disable-next-line react-refresh/only-export-components
export const LEADS_TABLE_COLUMN_WIDTH_CLASSES = {
  name: 'min-w-[190px]',
  email: 'min-w-[270px]',
  phone: 'min-w-[150px]',
  campaign: 'min-w-[210px]',
  date: 'min-w-[200px]',
  status: 'min-w-[160px]',
  action: 'min-w-[140px]',
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

type ScrollMetrics = {
  clientWidth: number;
  maxScroll: number;
  scrollLeft: number;
};

const EMPTY_SCROLL_METRICS: ScrollMetrics = { clientWidth: 0, maxScroll: 0, scrollLeft: 0 };

function HorizontalScrollAffordance({
  scrollContainerRef,
  contentKey,
  tableId,
}: {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  contentKey: string;
  tableId: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL_METRICS);

  const syncMetrics = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    setMetrics({
      clientWidth: element.clientWidth,
      maxScroll,
      scrollLeft: Math.min(element.scrollLeft, maxScroll),
    });
  }, [scrollContainerRef]);

  const setScrollLeft = useCallback((nextScrollLeft: number) => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth);
    element.scrollLeft = Math.min(Math.max(0, nextScrollLeft), maxScroll);
    syncMetrics();
  }, [scrollContainerRef, syncMetrics]);

  useEffect(() => {
    syncMetrics();

    const element = scrollContainerRef.current;
    if (!element) return;

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(syncMetrics);
    resizeObserver?.observe(element);
    if (element.firstElementChild) resizeObserver?.observe(element.firstElementChild);
    element.addEventListener('scroll', syncMetrics);
    window.addEventListener('resize', syncMetrics);

    return () => {
      resizeObserver?.disconnect();
      element.removeEventListener('scroll', syncMetrics);
      window.removeEventListener('resize', syncMetrics);
    };
  }, [contentKey, scrollContainerRef, syncMetrics]);

  const hasOverflow = metrics.maxScroll > 0;
  const thumbSizePercent = hasOverflow
    ? Math.max(12, Math.min(100, (metrics.clientWidth / (metrics.clientWidth + metrics.maxScroll)) * 100))
    : 100;
  const thumbOffsetPercent = hasOverflow
    ? (metrics.scrollLeft / metrics.maxScroll) * (100 - thumbSizePercent)
    : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(metrics.clientWidth * 0.75, 120);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setScrollLeft(metrics.scrollLeft + step);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setScrollLeft(metrics.scrollLeft - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setScrollLeft(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setScrollLeft(metrics.maxScroll);
    }
  };

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width > 0) setScrollLeft(((event.clientX - rect.left) / rect.width) * metrics.maxScroll);
  };

  const handleThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: metrics.scrollLeft,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !track) return;

    const rect = track.getBoundingClientRect();
    const thumbWidth = (thumbSizePercent / 100) * rect.width;
    const availableTrackWidth = Math.max(1, rect.width - thumbWidth);
    setScrollLeft(drag.startScrollLeft + ((event.clientX - drag.startX) / availableTrackWidth) * metrics.maxScroll);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  if (!hasOverflow) return null;

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <p className="mb-2 text-xs text-text-tertiary">Role para ver todos os dados</p>
      <div
        ref={trackRef}
        data-testid="leads-table-scroll-track"
        role="scrollbar"
        tabIndex={0}
        aria-label="Rolagem horizontal da tabela de clientes"
        aria-controls={tableId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.round(metrics.maxScroll)}
        aria-valuenow={Math.round(metrics.scrollLeft)}
        onKeyDown={handleKeyDown}
        onPointerDown={handleTrackPointerDown}
        className="relative h-2 w-full cursor-pointer rounded-full bg-surface-secondary outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <div
          data-testid="leads-table-scroll-thumb"
          onPointerDown={handleThumbPointerDown}
          onPointerMove={handleThumbPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className="absolute inset-y-0 rounded-full bg-brand transition-[left] duration-75 hover:bg-brand/80 active:cursor-grabbing"
          style={{ left: `${thumbOffsetPercent}%`, width: `${thumbSizePercent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Página dedicada de leads de formulário (objetivo 'leads').
 * Filtro por campanha — o dropdown lista apenas campanhas OUTCOME_LEADS
 * (somente elas geram dados de formulário). Padrão: "Todas as campanhas".
 */
export function LeadsPage() {
  const [campaignId, setCampaignId] = useState<string>('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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
        return <span className="block whitespace-nowrap text-text-primary font-medium" title={name}>{name}</span>;
      },
    },
    {
      key: 'email' as const,
      label: 'E-mail',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.email,
      render: (value: unknown) => {
        const email = String(value ?? '—');
        return (
          <span className="block whitespace-nowrap text-text-primary" title={email}>
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
        return <span className="block whitespace-nowrap text-text-primary" title={phone}>{phone}</span>;
      },
    },
    ...(showCampaignColumn
      ? [{
          key: 'campaignName' as keyof CampaignLead,
          label: 'Campanha',
          thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.campaign,
          render: (value: unknown) => {
            const campaignName = String(value ?? '—');
            return <span className="block whitespace-nowrap text-text-secondary" title={campaignName}>{campaignName}</span>;
          },
        }]
      : []),
    {
      key: 'createdAt' as const,
      label: 'Data',
      thClass: LEADS_TABLE_COLUMN_WIDTH_CLASSES.date,
      render: (value: unknown) => (
        <span className="block whitespace-nowrap text-text-secondary">{formatDate(value as string | null)}</span>
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
        <label htmlFor="leads-campaign-filter" className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Filtrar por campanha
        </label>
        <div className="relative max-w-sm w-full">
          <select
            id="leads-campaign-filter"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            disabled={loadingCampaigns}
            className="w-full appearance-none rounded-full border border-border bg-surface px-4 py-3 pr-9 text-xs sm:text-sm text-text-primary outline-none cursor-pointer hover:border-text-tertiary/50 focus:border-brand transition-all duration-200 disabled:opacity-50"
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id} className="bg-surface text-text-primary">
                {c.name}
              </option>
            ))}
          </select>
          <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </div>
      </div>

      {errorCampaigns && (
        <div className="rounded-2xl border border-error/20 bg-error-light px-4 py-3.5 text-sm text-error">
          Não foi possível carregar as campanhas. Tente novamente.
        </div>
      )}

      {(campaignsDegraded || leadsDegraded) && <MetaSyncNotice firstSyncPending={campaignsFirstSync || leadsFirstSync} syncedAt={getLatestSync(campaignsSyncedAt, leadsSyncedAt)} />}

      {/* Lista de leads */}
      <div className="rounded-2xl border border-border bg-surface transition-all duration-300 hover:border-border-light">
        <div
          ref={scrollContainerRef}
          data-testid="leads-table-scroll"
          className="overflow-x-auto"
        >
        {isLoading ? (
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
          <table id="leads-table" className={`w-max min-w-full text-sm ${tableMinWidthClass}`}>
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
        )}
        </div>
        <HorizontalScrollAffordance
          scrollContainerRef={scrollContainerRef}
          contentKey={`${campaignId}-${leads.length}-${isLoading}`}
          tableId="leads-table"
        />
      </div>
    </div>
  );
}
