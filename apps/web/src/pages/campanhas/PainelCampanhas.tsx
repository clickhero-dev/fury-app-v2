import { useState, useMemo } from 'react';
import { Search, Loader2, Pause, Play } from 'lucide-react';
import { AppLayout, PageHeader, DataTable, StatusBadge, Button } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCampaigns } from '@/hooks/useCampaigns';
import { usePauseCampaign } from '@/hooks/usePauseCampaign';
import type { CampaignData } from '@/types/campaigns';
import {
  formatConversions,
  formatCpaBRL,
  formatInvestidoBRL,
  formatRoas,
} from '@/lib/format-campaign-metrics';

type FilterType = 'todos' | 'ativo' | 'pausado' | 'finalizado';

const STATUS_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'todos',      label: 'Todos os status' },
  { value: 'ativo',      label: 'Ativas' },
  { value: 'pausado',    label: 'Pausadas' },
  { value: 'finalizado', label: 'Finalizadas' },
];

const StatusBadgeAdapter = ({ status }: { status: CampaignData['status'] }) => {
  const mappedStatus =
    status === 'ativo'      ? 'active'  :
    status === 'pausado'    ? 'paused'  :
    status === 'finalizado' ? 'approved': 'pending';
  return <StatusBadge status={mappedStatus} />;
};

const PAGE_SIZE = 10;

export function PainelCampanhas() {
  const [filter, setFilter] = useState<FilterType>('ativo');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [campaignToPause, setCampaignToPause] = useState<CampaignData | null>(null);

  const { data: campaigns = [], isLoading } = useCampaigns();
  const pauseMutation = usePauseCampaign();

  const pendingCampaignId =
    pauseMutation.isPending && pauseMutation.variables
      ? pauseMutation.variables.id
      : null;

  const handleResume = (campaign: CampaignData) => {
    pauseMutation.mutate({ id: campaign.id, action: 'resume' });
  };

  const handleConfirmPause = () => {
    if (!campaignToPause) return;
    pauseMutation.mutate(
      { id: campaignToPause.id, action: 'pause' },
      { onSettled: () => setCampaignToPause(null) }
    );
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
    let result = filter === 'todos' ? campaigns : campaigns.filter((c) => c.status === filter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((c) => c.name.toLowerCase().includes(q));
    return result;
  }, [filter, search, campaigns]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const pagedCampaigns = filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      key: 'name' as const,
      label: 'Nome da Campanha',
      render: (value: unknown) => (
        <span className="block truncate max-w-[260px]" title={String(value)}>
          {String(value)}
        </span>
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
      render: (value: unknown) => formatInvestidoBRL(value as number | null),
    },
    {
      key: 'roas' as const,
      label: 'ROAS',
      align: 'right' as const,
      render: (value: unknown) => formatRoas(value as number | null),
    },
    {
      key: 'cpa' as const,
      label: 'CPA',
      align: 'right' as const,
      render: (value: unknown) => {
        const cpaValue = value as number | null;
        return (
          <span className={cpaValue != null && cpaValue > 60 ? 'text-red-600 font-semibold' : 'text-text-primary'}>
            {formatCpaBRL(cpaValue)}
          </span>
        );
      },
    },
    {
      key: 'conversoes' as const,
      label: 'Conversões',
      align: 'right' as const,
      render: (value: unknown) => formatConversions(value as number | null),
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                disabled={pauseMutation.isPending}
                onClick={() => setCampaignToPause(row)}
              >
                {isRowPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                Pausar
              </button>
            )}
            {row.status === 'pausado' && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                disabled={pauseMutation.isPending}
                onClick={() => handleResume(row)}
              >
                {isRowPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Ativar
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Campanhas</h2>
          <Button variant="primary" size="sm">
            + Nova Campanha
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Gerenciamento de Campanhas"
          description="Monitore e otimize o desempenho de todas as suas campanhas"
        />

        {/* Toolbar: search + status filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar campanha..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors"
            />
          </div>

          {/* Status select */}
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value as FilterType)}
            className="sm:w-48 px-4 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30 focus:border-[#EA580C] transition-colors cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="space-y-3">
          <DataTable
            columns={columns}
            data={pagedCampaigns}
            keyField="id"
            isLoading={isLoading}
            isEmpty={filteredCampaigns.length === 0 && !isLoading}
            emptyMessage="Nenhuma campanha encontrada"
            theadRowClassName="bg-gray-50"
            thClassName="uppercase text-xs text-gray-500 tracking-wider font-semibold py-3"
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 text-sm text-text-secondary">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCampaigns.length)} de {filteredCampaigns.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹ Anterior
                </button>
                <span className="font-medium text-text-primary">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page === totalPages}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Próxima ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={campaignToPause !== null}
        onOpenChange={(open) => {
          if (!open && !pauseMutation.isPending) setCampaignToPause(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar campanha</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja pausar a campanha &quot;{campaignToPause?.name}&quot;? Ela
              deixará de veicular anúncios até ser reativada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={pauseMutation.isPending}
              onClick={() => setCampaignToPause(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={pauseMutation.isPending}
              onClick={handleConfirmPause}
            >
              {pauseMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pausando...
                </span>
              ) : (
                'Confirmar pausa'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
