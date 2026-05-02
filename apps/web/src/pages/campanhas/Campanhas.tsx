import { useState, useMemo } from 'react';
import { AppLayout, PageHeader, DataTable, Button, Card } from '@/components';

interface CampaignItem {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: 'ativo' | 'pausado' | 'finalizado';
  budget: string;
  spent: string;
  performance: string;
}

type FilterType = 'todos' | 'ativo' | 'pausado' | 'finalizado';

export function Campanhas() {
  const [filter, setFilter] = useState<FilterType>('todos');

  const allCampaigns: CampaignItem[] = useMemo(
    () => [
      {
        id: '1',
        name: 'Promoção Verão 2026',
        type: 'Pesquisa Paga',
        startDate: '01/01/2026',
        endDate: '31/03/2026',
        status: 'ativo',
        budget: 'R$ 15.000',
        spent: 'R$ 8.234',
        performance: '↑ 340%',
      },
      {
        id: '2',
        name: 'Campanha de Email',
        type: 'Email Marketing',
        startDate: '15/01/2026',
        endDate: '31/05/2026',
        status: 'ativo',
        budget: 'R$ 3.500',
        spent: 'R$ 1.800',
        performance: '↑ 215%',
      },
      {
        id: '3',
        name: 'Anúncios em Rede Social',
        type: 'Social Media',
        startDate: '05/02/2026',
        endDate: '30/04/2026',
        status: 'ativo',
        budget: 'R$ 8.000',
        spent: 'R$ 6.234',
        performance: '↑ 285%',
      },
      {
        id: '4',
        name: 'Retargeting Display',
        type: 'Display Ads',
        startDate: '20/01/2026',
        endDate: '30/05/2026',
        status: 'pausado',
        budget: 'R$ 5.000',
        spent: 'R$ 2.100',
        performance: '→ 198%',
      },
      {
        id: '5',
        name: 'Lançamento de Produto',
        type: 'Pesquisa Paga',
        startDate: '01/12/2025',
        endDate: '31/12/2025',
        status: 'finalizado',
        budget: 'R$ 20.000',
        spent: 'R$ 19.800',
        performance: '↑ 425%',
      },
      {
        id: '6',
        name: 'Campanha Sazonalidade',
        type: 'Email Marketing',
        startDate: '15/11/2025',
        endDate: '30/11/2025',
        status: 'finalizado',
        budget: 'R$ 4.000',
        spent: 'R$ 3.950',
        performance: '↑ 365%',
      },
    ],
    []
  );

  const filteredCampaigns = useMemo(() => {
    if (filter === 'todos') return allCampaigns;
    return allCampaigns.filter((campaign) => campaign.status === filter);
  }, [filter, allCampaigns]);

  const campaignColumns = [
    {
      key: 'name' as const,
      label: 'Nome da Campanha',
    },
    {
      key: 'type' as const,
      label: 'Tipo',
      render: (value: any) => (
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-accent-light/10 text-accent-light rounded-lg text-xs font-semibold">
          {value}
        </span>
      ),
    },
    {
      key: 'startDate' as const,
      label: 'Período',
      render: (_: string, row: CampaignItem) => (
        <span className="text-text-primary text-sm">
          {row.startDate} a {row.endDate}
        </span>
      ),
    },
    {
      key: 'budget' as const,
      label: 'Orçamento',
      align: 'right' as const,
    },
    {
      key: 'spent' as const,
      label: 'Gasto',
      align: 'right' as const,
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: any) => (
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold ${
            value === 'ativo'
              ? 'bg-success-light text-success'
              : value === 'pausado'
                ? 'bg-warning-light text-warning'
                : 'bg-[#6E7681]/10 text-text-secondary'
          }`}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      key: 'id' as const,
      label: '',
      align: 'right' as const,
      render: () => (
        <div className="flex items-center gap-2">
          <button className="p-1 hover:bg-surface-secondary rounded-lg transition-colors">
            <svg className="w-4 h-4 text-text-secondary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button className="p-1 hover:bg-error-light rounded-lg transition-colors">
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  const filterOptions: Array<{ value: FilterType; label: string; count: number }> = [
    {
      value: 'todos',
      label: 'Todas',
      count: allCampaigns.length,
    },
    {
      value: 'ativo',
      label: 'Ativas',
      count: allCampaigns.filter((c) => c.status === 'ativo').length,
    },
    {
      value: 'pausado',
      label: 'Pausadas',
      count: allCampaigns.filter((c) => c.status === 'pausado').length,
    },
    {
      value: 'finalizado',
      label: 'Finalizadas',
      count: allCampaigns.filter((c) => c.status === 'finalizado').length,
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
          description="Crie, monitore e otimize todas as suas campanhas em um único lugar"
        />

        {/* Filters */}
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
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 01.9.5l5.324 9.355a1 1 0 001.8 0l5.324-9.355A1 1 0 0117 4H3z" />
                  </svg>
                  {option.label}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
                    {option.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Campaigns Table */}
        <section className="space-y-4">
          <DataTable
            columns={campaignColumns}
            data={filteredCampaigns}
            keyField="id"
            isEmpty={filteredCampaigns.length === 0}
            emptyMessage="Nenhuma campanha encontrada para o filtro selecionado"
          />
        </section>
      </div>
    </AppLayout>
  );
}
