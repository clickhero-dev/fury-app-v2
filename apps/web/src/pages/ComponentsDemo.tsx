import { useMemo } from 'react';
import { AppLayout, MetricCard, PageHeader, DataTable, Button, Card } from '@/components';

interface ComponentDemoItem {
  id: string;
  name: string;
  category: string;
  status: string;
  usage: number;
}

export function ComponentsDemo() {
  const demoMetrics = [
    {
      label: 'Campanhas Ativas',
      value: 12,
      change: 8,
      changeLabel: 'vs. mês passado',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.5 1.5H5.75A2.25 2.25 0 0 0 3.5 3.75v12.5A2.25 2.25 0 0 0 5.75 18.5h8.5a2.25 2.25 0 0 0 2.25-2.25V8M10.5 1.5v5h5M10.5 10.5h4.75M10.5 13h4.75" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      ),
      trend: 'up' as const,
    },
    {
      label: 'Taxa de Conversão',
      value: '34.8%',
      change: 5,
      changeLabel: 'vs. mês passado',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      ),
      trend: 'up' as const,
    },
    {
      label: 'Impressões',
      value: '245.3K',
      change: -2,
      changeLabel: 'vs. mês passado',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ),
      trend: 'down' as const,
    },
    {
      label: 'Cliques',
      value: '8.5K',
      change: 12,
      changeLabel: 'vs. mês passado',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      ),
      trend: 'up' as const,
    },
  ];

  const demoTableData: ComponentDemoItem[] = useMemo(
    () => [
      {
        id: '1',
        name: 'MetricCard Component',
        category: 'Cards',
        status: 'Ativo',
        usage: 245,
      },
      {
        id: '2',
        name: 'PageHeader Component',
        category: 'Layout',
        status: 'Ativo',
        usage: 189,
      },
      {
        id: '3',
        name: 'DataTable Component',
        category: 'Tables',
        status: 'Ativo',
        usage: 342,
      },
      {
        id: '4',
        name: 'AppLayout Component',
        category: 'Layout',
        status: 'Ativo',
        usage: 567,
      },
      {
        id: '5',
        name: 'Button Component',
        category: 'Controls',
        status: 'Ativo',
        usage: 1203,
      },
    ],
    []
  );

  const tableColumns = [
    {
      key: 'name' as const,
      label: 'Nome do Componente',
    },
    {
      key: 'category' as const,
      label: 'Categoria',
      render: (value: string) => (
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-[#E8631A]/10 text-[#E8631A] rounded-lg text-xs font-semibold">
          {value}
        </span>
      ),
    },
    {
      key: 'status' as const,
      label: 'Status',
      render: (value: string) => (
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-[#2EA043]/10 text-[#2EA043] rounded-lg text-xs font-semibold">
          {value}
        </span>
      ),
    },
    {
      key: 'usage' as const,
      label: 'Uso',
      align: 'right' as const,
    },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1C1C1E]">FURY</h2>
          <Button variant="primary" size="sm">
            Documentação
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Demonstração de Componentes"
          description="Explore todos os componentes disponíveis e sua utilização na plataforma FURY"
        />

        {/* Metrics Section */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-[#1C1C1E]">Métricas de Exemplo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {demoMetrics.map((metric, idx) => (
              <MetricCard key={idx} {...metric} />
            ))}
          </div>
        </section>

        {/* Components Table Section */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-[#1C1C1E]">Componentes Disponíveis</h3>
          <DataTable
            columns={tableColumns as any}
            data={demoTableData}
            keyField="id"
          />
        </section>

        {/* UI Components Showcase */}
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-[#1C1C1E]">Variações de Botões</h3>
          <Card>
            <div className="p-6 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="sm">Primary Small</Button>
                <Button variant="primary" size="md">Primary Medium</Button>
                <Button variant="primary" size="lg">Primary Large</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm">Outline Small</Button>
                <Button variant="outline" size="md">Outline Medium</Button>
                <Button variant="outline" size="lg">Outline Large</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" size="sm">Outline Small</Button>
                <Button variant="outline" size="md">Outline Medium</Button>
                <Button variant="outline" size="lg">Outline Large</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" size="sm">Ghost Small</Button>
                <Button variant="ghost" size="md">Ghost Medium</Button>
                <Button variant="ghost" size="lg">Ghost Large</Button>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
