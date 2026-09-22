import { useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components';
import { useCampaignLeads, type CampaignLead } from '@/hooks/useCampaignLeads';
import { useLeadCampaigns } from '@/hooks/useLeadCampaigns';

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

/**
 * Página dedicada de leads de formulário (objetivo 'leads').
 * Filtro por campanha — o dropdown lista apenas campanhas OUTCOME_LEADS
 * (somente elas geram dados de formulário). Padrão: "Todas as campanhas".
 */
export function LeadsPage() {
  const [campaignId, setCampaignId] = useState<string>('');
  const { campaigns, isLoading: loadingCampaigns, isError: errorCampaigns } = useLeadCampaigns();
  const { leads, isLoading, isError, errorMessage } = useCampaignLeads(
    campaignId || null,
    true,
    campaignId === '',
  );

  const showCampaignColumn = campaignId === '';

  const columns = [
    {
      key: 'name' as const,
      label: 'Nome',
      render: (value: unknown) => (
        <span className="text-text-primary font-medium">{String(value ?? '—')}</span>
      ),
    },
    {
      key: 'email' as const,
      label: 'E-mail',
      render: (value: unknown) => (
        <span className="text-text-primary break-all">{String(value ?? '—')}</span>
      ),
    },
    {
      key: 'phone' as const,
      label: 'Telefone',
      render: (value: unknown) => (
        <span className="text-text-primary whitespace-nowrap">{String(value ?? '—')}</span>
      ),
    },
    ...(showCampaignColumn
      ? [{
          key: 'campaignName' as keyof CampaignLead,
          label: 'Campanha',
          render: (value: unknown) => (
            <span className="text-text-secondary">{String(value ?? '—')}</span>
          ),
        }]
      : []),
    {
      key: 'createdAt' as const,
      label: 'Data',
      render: (value: unknown) => (
        <span className="text-text-secondary whitespace-nowrap">{formatDate(value as string | null)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      <PageHeader
        title="Leads"
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

      {/* Lista de leads */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-light transition-all duration-300">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando leads...
          </div>
        ) : isError ? (
          <div className="py-16 px-6 text-sm text-error text-center">
            {errorMessage || 'Não foi possível carregar os leads. Tente novamente.'}
          </div>
        ) : !isLoading && campaigns.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhuma campanha de Formulário"
            description="Crie uma campanha com o objetivo Formulário para coletar leads por aqui."
          />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="Nenhum lead ainda"
            description="Quando alguém preencher o formulário dos seus anúncios, os contatos aparecerão aqui."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-secondary/40">
                {columns.map((col) => (
                  <th key={col.key as string} className="text-left uppercase text-[11px] text-text-tertiary tracking-wider font-semibold py-4 px-4">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead, i) => (
                <tr key={`${lead.email ?? 'lead'}-${i}`} className="hover:bg-surface-secondary/30 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key as string} className="py-3 px-4">
                      {col.render(lead[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}