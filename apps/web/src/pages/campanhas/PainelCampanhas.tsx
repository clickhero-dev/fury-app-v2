import { useState, useMemo } from 'react';
import { AppLayout, PageHeader, DataTable, StatusBadge, Button, Card } from '@/components';
import { useCampaigns } from '@/hooks/useCampaigns';
import { usePauseCampaign } from '@/hooks/usePauseCampaign';
import { useAutomationFeed } from '@/hooks/useAutomationFeed';
import type { CampaignData } from '@/types/campaigns';
import {
  formatConversions,
  formatCpaBRL,
  formatRoas,
} from '@/lib/format-campaign-metrics';

type FilterType = 'todos' | 'ativo' | 'pausado' | 'finalizado';

// 🔧 ADICIONE ESTE COMPONENTE WRAPPER
const StatusBadgeAdapter = ({ status }: { status: CampaignData['status'] }) => {
  // Mapeia os status do seu sistema para os do componente StatusBadge
  const mappedStatus = 
    status === 'ativo' ? 'active' :
    status === 'pausado' ? 'paused' :
    status === 'finalizado' ? 'approved' : 'pending';
  
  return <StatusBadge status={mappedStatus} />;
};

export function PainelCampanhas() {
  const [filter, setFilter] = useState<FilterType>('todos');
  const { data: campaigns = [], isLoading } = useCampaigns();
  const pauseMutation = usePauseCampaign();
  const { feed, isConnected } = useAutomationFeed();

  const filteredCampaigns = useMemo(() => {
    if (filter === 'todos') return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [filter, campaigns]);

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
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: unknown) => (  // ← REMOVIDO parâmetro row não usado
        <StatusBadgeAdapter status={value as CampaignData['status']} />
      ),
    },
    {
      key: 'investido' as const,
      label: 'Investido',
      align: 'right' as const,
      render: (value: unknown) =>
        `R$ ${(value as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
      label: '',
      align: 'right' as const,
      render: (_value: unknown, row: CampaignData) => (
        <div className="flex items-center gap-2">
          <button
            className="p-1 hover:bg-surface-secondary rounded-lg transition-colors disabled:opacity-50"
            title="Editar"
            disabled={pauseMutation.isPending}
          >
            <svg className="w-4 h-4 text-text-secondary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            className="p-1 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title={row.status === 'ativo' ? 'Pausar' : 'Ativar'}
            disabled={pauseMutation.isPending}
            onClick={() => {
              const action = row.status === 'ativo' ? 'pause' : 'resume';
              const message = action === 'pause'
                ? `Tem certeza que deseja pausar a campanha "${row.name}"?`
                : `Tem certeza que deseja ativar a campanha "${row.name}"?`;

              if (window.confirm(message)) {
                pauseMutation.mutate({ id: row.id, action });
              }
            }}
          >
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ),
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

        {/* Filtros */}
        <Card>
          <div className="p-6">
            <div className="flex flex-wrap gap-3">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
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

        {/* Layout com Tabela e Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tabela */}
          <section className="lg:col-span-2">
            <DataTable
              columns={columns}
              data={filteredCampaigns}
              keyField="id"
              isLoading={isLoading}
              isEmpty={filteredCampaigns.length === 0 && !isLoading}
              emptyMessage="Nenhuma campanha encontrada para o filtro selecionado"
            />
          </section>

          {/* Feed SSE */}
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
    </AppLayout>
  );
}
