import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout, PageHeader, Button, Card, StatusBadge, EmptyState, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { MOCK_ASSETS } from '@/lib/studio-mock';
import type { StudioAsset } from '@/types/studio';

type FilterType = 'todos' | 'imagens' | 'copy' | 'pendente' | 'aprovado' | 'reprovado';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

export function EstudioHome() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('todos');

  const { data, isLoading } = useQuery<StudioAssetResponse>({
    queryKey: ['studio/assets'],
    queryFn: async () => {
      try {
        const response = await api.get('/studio/assets');
        return response.data;
      } catch (error) {
        throw error;
      }
    },
    retry: 2,
  });

  const assets = useMemo(() => {
    const assetList = data?.assets || MOCK_ASSETS;

    if (filter === 'todos') return assetList;
    if (filter === 'imagens') return assetList.filter((a) => a.type === 'image');
    if (filter === 'copy') return assetList.filter((a) => a.type === 'copy');
    if (filter === 'pendente') return assetList.filter((a) => a.compliance_status === 'pending');
    if (filter === 'aprovado') return assetList.filter((a) => a.compliance_status === 'approved');
    if (filter === 'reprovado') return assetList.filter((a) => a.compliance_status === 'rejected');

    return assetList;
  }, [data, filter]);

  const filterOptions: Array<{ value: FilterType; label: string; count?: number }> = [
    { value: 'todos', label: 'Todos', count: data?.assets?.length || MOCK_ASSETS.length },
    { value: 'imagens', label: 'Imagens', count: (data?.assets || MOCK_ASSETS).filter((a) => a.type === 'image').length },
    { value: 'copy', label: 'Copy', count: (data?.assets || MOCK_ASSETS).filter((a) => a.type === 'copy').length },
    { value: 'pendente', label: 'Pendente', count: (data?.assets || MOCK_ASSETS).filter((a) => a.compliance_status === 'pending').length },
    { value: 'aprovado', label: 'Aprovado', count: (data?.assets || MOCK_ASSETS).filter((a) => a.compliance_status === 'approved').length },
    { value: 'reprovado', label: 'Reprovado', count: (data?.assets || MOCK_ASSETS).filter((a) => a.compliance_status === 'rejected').length },
  ];

  const handleGenerateClick = () => {
    navigate('/estudio/imagem');
  };

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Estúdio Criativo</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerateClick}
            className="bg-[#E8631A] hover:bg-[#D45714]"
          >
            + Gerar Novo Criativo
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Estúdio Criativo"
          description="Visualize, filtre e gerencie seus criativos gerados por IA"
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
                  {option.label}
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
                    {option.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            title="Gere seu primeiro criativo com IA"
            description="Clique no botão acima para começar a gerar criativos incríveis"
            action={{
              label: 'Gerar Novo Criativo',
              onClick: handleGenerateClick,
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="bg-white rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Thumbnail */}
                {asset.url && asset.type === 'image' ? (
                  <div className="relative w-full aspect-square bg-surface-secondary overflow-hidden">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-square bg-gradient-to-br from-[#FEF0E7] to-[#FFE8D6] flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-[#E8631A]/40"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                )}

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-text-primary text-sm flex-1 line-clamp-2">
                      {asset.name}
                    </h3>
                  </div>

                  <StatusBadge status={asset.compliance_status} />

                  {/* Buttons */}
                  <div className="flex gap-2 pt-2">
                    <button className="flex-1 px-3 py-2 border border-[#E8631A] text-[#E8631A] rounded-lg text-xs font-semibold hover:bg-[#FEF0E7] transition-colors">
                      Usar em campanha
                    </button>
                    <button className="flex-1 px-3 py-2 bg-[#E8631A] text-white rounded-lg text-xs font-semibold hover:bg-[#D45714] transition-colors">
                      Ver detalhes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
