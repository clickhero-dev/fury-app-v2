import { useMemo } from 'react';
import { AppLayout, MetricCard, PageHeader, DataTable, Button } from '@/components';

interface Campaign {
  id: string;
  name: string;
  status: 'ativo' | 'pausado' | 'finalizado';
  impressions: number;
  clicks: number;
  conversions: number;
  roi: string;
}

export function Dashboard() {
  const metrics = [
    {
      label: 'Campanhas Ativas',
      value: 12,
      change: 8,
      changeLabel: 'vs. semana passada',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
        </svg>
      ),
      trend: 'up' as const,
    },
    {
      label: 'Taxa de Conversão',
      value: '34.8%',
      change: 5,
      changeLabel: 'vs. semana passada',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      ),
      trend: 'up' as const,
    },
    {
      label: 'Total de Impressões',
      value: '1.2M',
      change: 12,
      changeLabel: 'vs. semana passada',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 11.93a7.001 7.001 0 00-10.86 0M17.07 11.93a9 9 0 00-14.14 0M15.68 16.68a5.5 5.5 0 11-11.36 0" />
        </svg>
      ),
      trend: 'up' as const,
    },
    {
      label: 'Receita Gerada',
      value: 'R$ 45.2K',
      change: 18,
      changeLabel: 'vs. semana passada',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8.16 2.75a.75.75 0 0 0-.75.75v2h3V3.5a.75.75 0 0 0-.75-.75H8.16zM10 2a.75.75 0 0 1 .75.75V5h2V3.75A.75.75 0 0 1 13.5 3v2H16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2.5V3.75A.75.75 0 0 1 10 2z" />
        </svg>
      ),
      trend: 'up' as const,
    },
  ];

  const campaigns: Campaign[] = useMemo(
    () => [
      {
        id: '1',
        name: 'Promoção Verão 2026',
        status: 'ativo',
        impressions: 234500,
        clicks: 12400,
        conversions: 4321,
        roi: '340%',
      },
      {
        id: '2',
        name: 'Black Friday Preview',
        status: 'ativo',
        impressions: 189300,
        clicks: 8900,
        conversions: 2134,
        roi: '285%',
      },
      {
        id: '3',
        name: 'Lançamento Novo Produto',
        status: 'ativo',
        impressions: 156700,
        clicks: 7234,
        conversions: 1876,
        roi: '312%',
      },
      {
        id: '4',
        name: 'Campanha de Retargeting',
        status: 'pausado',
        impressions: 98200,
        clicks: 3421,
        conversions: 567,
        roi: '198%',
      },
      {
        id: '5',
        name: 'Teste A/B Página Principal',
        status: 'finalizado',
        impressions: 456800,
        clicks: 23400,
        conversions: 8923,
        roi: '425%',
      },
    ],
    []
  );

  const campaignColumns = [
    {
      key: 'name' as const,
      label: 'Campanha',
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: string) => (
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold ${
            value === 'ativo'
              ? 'bg-[#2EA043]/10 text-[#2EA043]'
              : value === 'pausado'
                ? 'bg-[#FFB81C]/10 text-[#FFB81C]'
                : 'bg-[#6E7681]/10 text-[#6E7681]'
          }`}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      key: 'impressions' as const,
      label: 'Impressões',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      key: 'clicks' as const,
      label: 'Cliques',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      key: 'conversions' as const,
      label: 'Conversões',
      align: 'right' as const,
      render: (value: number) => value.toLocaleString('pt-BR'),
    },
    {
      key: 'roi' as const,
      label: 'ROI',
      align: 'right' as const,
    },
  ];

  const handleNewCampaign = () => {
    // TODO: Navegar para criar nova campanha
    console.log('Criar nova campanha');
  };

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1C1C1E]">FURY Dashboard</h2>
          <Button variant="primary" size="sm" onClick={handleNewCampaign}>
            + Nova Campanha
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description="Visão geral do desempenho das suas campanhas"
        />

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, idx) => (
            <MetricCard key={idx} {...metric} />
          ))}
        </div>

        {/* Recent Campaigns */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#1C1C1E]">Campanhas Recentes</h3>
            <Button variant="ghost" size="sm">
              Ver Todas
            </Button>
          </div>
          <DataTable
            columns={campaignColumns}
            data={campaigns}
            keyField="id"
          />
        </section>
      </div>
    </AppLayout>
  );
}
