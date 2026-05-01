import { useState, useMemo } from 'react';
import { AppLayout, PageHeader, DataTable, Button, Card } from '@/components';

interface Creative {
  id: string;
  name: string;
  type: 'anúncio' | 'banner' | 'vídeo' | 'imagem';
  campaign: string;
  createdAt: string;
  performance: string;
  status: 'ativo' | 'rascunho' | 'arquivado';
}

export function EstudioCriativo() {
  const [selectedTab, setSelectedTab] = useState<'todos' | 'meus' | 'templates'>('todos');

  const creatives: Creative[] = useMemo(
    () => [
      {
        id: '1',
        name: 'Anúncio Hero - Verão 2026',
        type: 'anúncio',
        campaign: 'Promoção Verão 2026',
        createdAt: '15/04/2026',
        performance: '↑ 340%',
        status: 'ativo',
      },
      {
        id: '2',
        name: 'Banner Lateral - Black Friday',
        type: 'banner',
        campaign: 'Black Friday Preview',
        createdAt: '10/04/2026',
        performance: '↑ 285%',
        status: 'ativo',
      },
      {
        id: '3',
        name: 'Vídeo Promotional 30s',
        type: 'vídeo',
        campaign: 'Lançamento Novo Produto',
        createdAt: '05/04/2026',
        performance: '↑ 312%',
        status: 'ativo',
      },
      {
        id: '4',
        name: 'Imagem de Produto - Frontal',
        type: 'imagem',
        campaign: 'Campanha de Retargeting',
        createdAt: '28/03/2026',
        performance: '→ 198%',
        status: 'arquivado',
      },
      {
        id: '5',
        name: 'Anúncio Carousel - Produtos',
        type: 'anúncio',
        campaign: 'Teste A/B Página Principal',
        createdAt: '20/03/2026',
        performance: '↑ 425%',
        status: 'ativo',
      },
      {
        id: '6',
        name: 'Banner Responsivo - Mobile',
        type: 'banner',
        campaign: 'Campanha Email',
        createdAt: '15/03/2026',
        performance: '↑ 215%',
        status: 'rascunho',
      },
    ],
    []
  );

  const creativeColumns = [
    {
      key: 'name' as const,
      label: 'Nome da Criação',
    },
    {
      key: 'type' as const,
      label: 'Tipo',
      render: (value: string) => (
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-[#E8631A]/10 text-[#E8631A] rounded-lg text-xs font-semibold">
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      key: 'campaign' as const,
      label: 'Campanha',
    },
    {
      key: 'createdAt' as const,
      label: 'Criado em',
    },
    {
      key: 'performance' as const,
      label: 'Performance',
      align: 'right' as const,
      render: (value: string) => (
        <span className={value.includes('↓') ? 'text-red-500 font-semibold' : 'text-[#2EA043] font-semibold'}>
          {value}
        </span>
      ),
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: string) => (
        <span
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold ${
            value === 'ativo'
              ? 'bg-[#2EA043]/10 text-[#2EA043]'
              : value === 'rascunho'
                ? 'bg-[#6E7681]/10 text-[#6E7681]'
                : 'bg-gray-200 text-gray-700'
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
          <button className="p-1 hover:bg-[#F6F8FA] rounded-lg transition-colors">
            <svg className="w-4 h-4 text-[#6E7681]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
          </button>
          <button className="p-1 hover:bg-[#F6F8FA] rounded-lg transition-colors">
            <svg className="w-4 h-4 text-[#6E7681]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7.707 6.293a1 1 0 010-1.414L13.586 12l-2.879-2.879a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  const tabs = [
    { id: 'todos', label: 'Todas as Criações', count: creatives.length },
    { id: 'meus', label: 'Minhas Criações', count: 4 },
    { id: 'templates', label: 'Templates', count: 12 },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1C1C1E]">Estúdio Criativo</h2>
          <Button variant="primary" size="sm">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Nova Criação
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Estúdio Criativo"
          description="Crie e gerenciador anúncios, banners e conteúdos visuais para suas campanhas"
        />

        {/* Tabs */}
        <Card>
          <div className="border-b border-[#E0E0E0]">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
                  className={`flex-1 px-6 py-4 font-semibold text-sm transition-colors border-b-2 ${
                    selectedTab === tab.id
                      ? 'border-[#E8631A] text-[#E8631A]'
                      : 'border-transparent text-[#6E7681] hover:text-[#1C1C1E]'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#F6F8FA] text-xs font-bold text-[#6E7681]">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Creatives Table */}
        <section className="space-y-4">
          <DataTable
            columns={creativeColumns}
            data={creatives}
            keyField="id"
          />
        </section>

        {/* Help Section */}
        <Card>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#E8631A] flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <div>
                <h4 className="font-bold text-[#1C1C1E]">Dica: Otimize suas Criações</h4>
                <p className="text-sm text-[#6E7681] mt-1">
                  Use diferentes formatos e mensagens em suas criações para encontrar o que melhor
                  ressona com seu público-alvo e maximize seus resultados.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
