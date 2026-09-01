import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import { Search, Loader2, Pause, Play, Trash2, ChevronDown, Plus } from 'lucide-react';
import { DataTable, StatusBadge, PageHeader } from '@/components';
import { PeriodSelector } from '@/components/PeriodSelector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCampaigns } from '@/hooks/useCampaigns';
import { usePauseCampaign, getFriendlyPauseError } from '@/hooks/usePauseCampaign';
import { useDeleteCampaign, getDeleteCampaignError } from '@/hooks/useDeleteCampaign';
import type { CampaignData } from '@/types/campaigns';
import {
  formatConversions,
  formatInvestidoBRL,
} from '@/lib/format-campaign-metrics';
import { type Period, getPeriodDates, formatPeriodLabel } from '@/lib/period-utils';

type FilterType = 'todos' | 'ativo' | 'pausado' | 'finalizado';

const STATUS_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'ativo', label: 'Ativas' },
  { value: 'pausado', label: 'Pausadas' },
  { value: 'finalizado', label: 'Finalizadas' },
];

const StatusBadgeAdapter = ({ status }: { status: CampaignData['status'] }) => {
  const mappedStatus =
    status === 'ativo' ? 'active' :
    status === 'pausado' ? 'paused' :
    status === 'finalizado' ? 'approved' : 'pending';
  return <StatusBadge status={mappedStatus} />;
};

const PAGE_SIZE = 10;

export function PainelCampanhas() {
  const [filter, setFilter] = useState<FilterType>('todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [campaignToPause, setCampaignToPause] = useState<CampaignData | null>(null);
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignData | null>(null);
  const [actionError, setActionError] = useState<string>('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('this_month');

  const { startDate, endDate } = getPeriodDates(period);
  const { data: result = { data: [] }, isLoading } = useCampaigns({ startDate, endDate });
  const campaigns = result.data ?? [];
  const subscriptionError = result.subscriptionError;
  const pauseMutation = usePauseCampaign();
  const deleteMutation = useDeleteCampaign();

  const pendingCampaignId =
    pauseMutation.isPending && pauseMutation.variables
      ? pauseMutation.variables.id
      : null;

  const handleResume = (campaign: CampaignData) => {
    setActionError('');
    pauseMutation.mutate(
      { id: campaign.id, action: 'resume' },
      { onError: (err) => setActionError(getFriendlyPauseError(err)) }
    );
  };

  const handleConfirmPause = () => {
    if (!campaignToPause) return;
    setActionError('');
    pauseMutation.mutate(
      { id: campaignToPause.id, action: 'pause' },
      {
        onSettled: () => setCampaignToPause(null),
        onError: (err) => setActionError(getFriendlyPauseError(err)),
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!campaignToDelete) return;
    setActionError('');
    deleteMutation.mutate(campaignToDelete.id, {
      onSettled: () => setCampaignToDelete(null),
      onError: (err) => setActionError(getDeleteCampaignError(err)),
    });
  };

  const handleFilterChange = (value: FilterType) => {
    setFilter(value);
    setPage(1);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const filteredCampaigns = useMemo(() => {
    let res;
    if (filter === 'todos') {
      // Padrão: mesmas campanhas que o dashboard soma ("Clientes alcançados" =
      // ACTIVE + PAUSED, exclui ARCHIVED/finalizadas). Assim o "Total Clientes"
      // (soma das linhas) reproduz o resumo do dashboard por construção.
      res = campaigns.filter((c) => c.status !== 'finalizado');
    } else {
      res = campaigns.filter((c) => c.status === filter);
    }
    const q = search.trim().toLowerCase();
    if (q) res = res.filter((c) => c.name.toLowerCase().includes(q));
    return res;
  }, [filter, search, campaigns]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const pagedCampaigns = filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    if (filteredCampaigns.length === 0) return null;
    // "Total Clientes" = soma das conversões das linhas de campanha exibidas
    // (ACTIVE+PAUSED do período). Com o backend calculando conversões pelo mesmo
    // critério do /metrics/summary, essa soma reproduz o "Clientes alcançados"
    // do dashboard — total da tela de campanhas bate com o dashboard.
    const totalInvestido = filteredCampaigns.reduce((sum, c) => sum + c.investido, 0);
    const totalConversoes = filteredCampaigns.reduce((sum, c) => sum + (c.conversoes ?? 0), 0);
    return { totalInvestido, totalConversoes };
  }, [filteredCampaigns]);

  const columns = [
    {
      key: 'name' as const,
      label: 'Nome da Campanha',
      render: (value: unknown, row: CampaignData) => (
        <Link
          to={`/campanhas/${row.id}/insights`}
          className="block truncate max-w-[260px] font-semibold text-text-primary hover:text-brand transition-colors"
          title={String(value)}
        >
          {String(value)}
        </Link>
      ),
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: unknown) => (
        <StatusBadgeAdapter status={value as CampaignData['status']} />
      ),
    },
    {
      key: 'investido' as const,
      label: 'Investido',
      align: 'right' as const,
      render: (value: unknown) => (
        <span className="text-text-primary font-medium">{formatInvestidoBRL(value as number | null)}</span>
      ),
    },
    {
      key: 'conversoes' as const,
      label: 'Clientes',
      align: 'right' as const,
      render: (value: unknown) => (
        <span className="text-text-primary font-medium">{formatConversions(value as number | null)}</span>
      ),
    },
    {
      key: 'id' as const,
      label: 'Ações',
      align: 'right' as const,
      render: (_value: unknown, row: CampaignData) => {
        const isRowPending = pendingCampaignId === row.id;
        return (
          <div className="flex items-center justify-end gap-2">
            {row.status === 'ativo' && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/25 rounded-full border border-accent/20 transition-all cursor-pointer disabled:opacity-50"
                disabled={pauseMutation.isPending}
                onClick={() => setCampaignToPause(row)}
              >
                {isRowPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                Pausar
              </button>
            )}
            {row.status === 'pausado' && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-brand bg-brand/10 hover:bg-brand/25 rounded-full border border-brand/20 transition-all cursor-pointer disabled:opacity-50"
                disabled={pauseMutation.isPending}
                onClick={() => handleResume(row)}
              >
                {isRowPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Ativar
              </button>
            )}
            {row.status !== 'finalizado' && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-error bg-error-light hover:bg-error/25 rounded-full border border-error/20 transition-all cursor-pointer disabled:opacity-50"
                disabled={deleteMutation.isPending}
                onClick={() => setCampaignToDelete(row)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      {/* Header Limpo Sem a Data no Topo */}
      <PageHeader
        title="Campanhas"
        description="Monitore e otimize o resultado de todas as suas campanhas"
        actions={
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 text-xs font-semibold text-white bg-brand hover:bg-brand-hover hover:scale-[1.02] active:scale-[0.98] rounded-full transition-all cursor-pointer shadow-md"
          >
            <Plus className="size-4 stroke-[2.5]" />
            Nova campanha
          </button>
        }
      />

   {/* Seletor de Período + Data Centralizada Logo Abaixo */}
    <div className="space-y-2.5">
      <div className="w-full">
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
        {/* Data centralizada com a barra de filtros */}
        <p className="!mt-6 text-[11px] font-semibold text-text-tertiary tracking-wider uppercase text-center">
          {formatPeriodLabel(startDate, endDate).replace(' - ', ' – ')}
        </p>
      </div>

      {/* Banners */}
      {actionError && (
        <div className="flex items-start gap-3 bg-error-light border border-error/20 rounded-2xl px-4 py-3.5 text-sm text-error">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="shrink-0 text-error hover:text-text-primary transition-colors text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {subscriptionError && (
        <div className="flex items-start gap-3 bg-warning-light border border-warning/20 rounded-2xl px-4 py-3.5 text-sm text-warning">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold">Assinatura vencida</p>
            <p className="text-xs mt-1 opacity-80">{subscriptionError.message}</p>
          </div>
        </div>
      )}

      {/* Toolbar: Busca + Filtro com Maior Altura e Efeitos Hover */}
      <div className="grid gap-3 sm:grid-cols-[1fr_160px] w-full">
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-full border border-border bg-surface hover:border-text-tertiary/50 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/30 transition-all duration-200">
          <Search className="size-4 shrink-0 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar campanha..."
            className="w-full bg-transparent text-xs sm:text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        <div className="relative">
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value as FilterType)}
            className="w-full appearance-none rounded-full border border-border bg-surface px-4 py-3 text-xs sm:text-sm text-text-primary outline-none cursor-pointer pr-9 hover:border-text-tertiary/50 focus:border-brand transition-all duration-200"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-surface text-text-primary">
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none" />
        </div>
      </div>

      {/* Conteúdo Principal / Empty State com Maior Altura e Efeito Hover */}
      <div className="space-y-4 w-full">
        {filteredCampaigns.length === 0 && !isLoading && !subscriptionError ? (
          <div className="w-full rounded-2xl border border-border bg-surface py-32 px-6 flex flex-col items-center justify-center text-center hover:border-border-light transition-all duration-300 shadow-sm">
            <h3 className="text-base font-semibold text-text-primary mb-2">
              Nenhuma campanha por aqui ainda
            </h3>
            <p className="text-xs sm:text-sm text-text-tertiary max-w-md leading-relaxed">
              Quando você criar uma campanha, o ady cuida da otimização e mostra os resultados nesta página.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-light transition-all duration-300">
            <DataTable
              columns={columns}
              data={pagedCampaigns}
              keyField="id"
              isLoading={isLoading}
              isEmpty={false}
              theadRowClassName="border-b border-border bg-surface-secondary/40"
              thClassName="uppercase text-[11px] text-text-tertiary tracking-wider font-semibold py-4 px-4"
            />
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 text-xs text-text-secondary">
            <span>
              Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCampaigns.length)} de {filteredCampaigns.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="border border-border bg-surface rounded-full px-3.5 py-1.5 text-xs text-text-primary hover:bg-surface-secondary hover:border-text-tertiary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                ‹ Anterior
              </button>
              <span className="font-semibold text-text-primary px-1">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
                className="border border-border bg-surface rounded-full px-3.5 py-1.5 text-xs text-text-primary hover:bg-surface-secondary hover:border-text-tertiary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Próxima ›
              </button>
            </div>
          </div>
        )}

        {/* Totais */}
        {summary && (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-light transition-all">
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-6 py-5">
                <p className="text-xs text-text-tertiary uppercase font-semibold tracking-wider">Total investido</p>
                <p className="text-xl font-bold text-text-primary mt-1">{formatInvestidoBRL(summary.totalInvestido)}</p>
              </div>
              <div className="px-6 py-5">
                <p className="text-xs text-text-tertiary uppercase font-semibold tracking-wider">Total Clientes</p>
                <p className="text-xl font-bold text-text-primary mt-1">{formatConversions(summary.totalConversoes)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modais */}
      <Dialog
        open={campaignToPause !== null}
        onOpenChange={(open) => {
          if (!open && !pauseMutation.isPending) setCampaignToPause(null);
        }}
      >
        <DialogContent className="bg-surface border border-border-light text-text-primary rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-text-primary text-lg">Pausar campanha</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Tem certeza que deseja pausar a campanha &quot;{campaignToPause?.name}&quot;? Ela
              deixará de veicular anúncios até ser reativada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <button
              type="button"
              disabled={pauseMutation.isPending}
              onClick={() => setCampaignToPause(null)}
              className="px-4 py-2 text-xs font-semibold rounded-full border border-border-light bg-surface-secondary text-text-primary hover:bg-surface-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pauseMutation.isPending}
              onClick={handleConfirmPause}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-accent text-text-primary hover:bg-accent-light transition-colors"
            >
              {pauseMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pausando...
                </span>
              ) : (
                'Confirmar pausa'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} />

      <Dialog
        open={campaignToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setCampaignToDelete(null);
        }}
      >
        <DialogContent className="bg-surface border border-border-light text-text-primary rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-text-primary text-lg">Excluir campanha</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Tem certeza que deseja excluir a campanha &quot;{campaignToDelete?.name}&quot;?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => setCampaignToDelete(null)}
              className="px-4 py-2 text-xs font-semibold rounded-full border border-border-light bg-surface-secondary text-text-primary hover:bg-surface-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-error hover:opacity-90 text-text-primary transition-colors"
            >
              {deleteMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Excluindo...
                </span>
              ) : (
                'Confirmar exclusão'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}