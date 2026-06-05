import { useState, useMemo } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { AppLayout, PageHeader, DataTable, StatusBadge, Button, Card } from '@/components';
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
import { useAutomationFeed } from '@/hooks/useAutomationFeed';
import type { CampaignData } from '@/types/campaigns';
import {
  formatConversions,
  formatCpaBRL,
  formatInvestidoBRL,
  formatRoas,
} from '@/lib/format-campaign-metrics';

type FilterType = 'todos' | 'ativo' | 'pausado' | 'finalizado';

const StatusBadgeAdapter = ({ status }: { status: CampaignData['status'] }) => {
  const mappedStatus =
    status === 'ativo'
      ? 'active'
      : status === 'pausado'
        ? 'paused'
        : status === 'finalizado'
          ? 'approved'
          : 'pending';

  return <StatusBadge status={mappedStatus} />;
};

const PAGE_SIZE = 10;

export function PainelCampanhas() {
  const [filter, setFilter] = useState<FilterType>('ativo');
  const [page, setPage] = useState(1);
  const [campaignToPause, setCampaignToPause] = useState<CampaignData | null>(null);
  const { data: campaigns = [], isLoading } = useCampaigns();
  const pauseMutation = usePauseCampaign();
  const { feed, isConnected } = useAutomationFeed();

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

  const filteredCampaigns = useMemo(() => {
    if (filter === 'todos') return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [filter, campaigns]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const pagedCampaigns = filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (value: FilterType) => {
    setFilter(value);
    setPage(1);
  };

  const filterOptions: Array<{ value: FilterType; label: string; count: number }> = useMemo(
    () => [
      {
        value: 'todos',
        label: 'Todas',
        count: campaigns.length,
      },
      {
        value: 'ativo',
        label: 'Ativas',
        count: campaigns.filter((c) => c.status === 'ativo').length,
      },
      {
        value: 'pausado',
        label: 'Pausadas',
        count: campaigns.filter((c) => c.status === 'pausado').length,
      },
      {
        value: 'finalizado',
        label: 'Finalizadas',
        count: campaigns.filter((c) => c.status === 'finalizado').length,
      },
    ],
    [campaigns]
  );

  const columns = [
    {
      key: 'name' as const,
      label: 'Nome da Campanha',
      render: (value: unknown) => (
        <span className="block truncate max-w-[200px]" title={String(value)}>
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
          <span
            className={
              cpaValue != null && cpaValue > 60
                ? 'text-red-600 font-semibold'
                : 'text-text-primary'
            }
          >
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
                {isRowPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-4 h-4" />
                )}
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
                {isRowPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
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
      <div className="space-y-8">
        <PageHeader
          title="Gerenciamento de Campanhas"
          description="Monitore e otimize o desempenho de todas as suas campanhas"
        />

        <Card>
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    filter === option.value
                      ? 'bg-[#E8631A] text-white'
                      : 'bg-surface-secondary text-text-secondary hover:bg-border'
                  }`}
                >
                  {option.label}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
                    {option.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 space-y-3">
            <DataTable
              columns={columns}
              data={pagedCampaigns}
              keyField="id"
              isLoading={isLoading}
              isEmpty={filteredCampaigns.length === 0 && !isLoading}
              emptyMessage="Nenhuma campanha encontrada para o filtro selecionado"
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
                  <span className="font-medium text-text-primary">
                    {page} / {totalPages}
                  </span>
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
          </section>

          <section className="lg:col-span-1">
            <Card className="h-fit">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-text-primary">Feed em Tempo Real</h3>
                  <div
                    className={`w-2 h-2 rounded-full transition-colors ${
                      isConnected ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                    title={isConnected ? 'Conectado' : 'Desconectado'}
                  />
                </div>

                {feed.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-text-secondary">
                      Nenhuma ação registrada ainda
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {feed.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-surface rounded-lg border border-border transition-opacity duration-300"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-accent uppercase">
                            {item.type === 'pause' && '⏸ Pausa'}
                            {item.type === 'resume' && '▶️ Retomada'}
                            {item.type === 'optimize' && '⚡ Otimização'}
                            {item.type === 'scale' && '📈 Escalonamento'}
                          </span>
                        </div>
                        <p className="text-sm text-text-primary mb-2 line-clamp-2">
                          {item.campaignName}
                        </p>
                        <p className="text-xs text-text-secondary mb-2">
                          {item.message}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {new Date(item.timestamp).toLocaleTimeString('pt-BR')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </section>
        </div>
      </div>

      <Dialog
        open={campaignToPause !== null}
        onOpenChange={(open) => {
          if (!open && !pauseMutation.isPending) {
            setCampaignToPause(null);
          }
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
