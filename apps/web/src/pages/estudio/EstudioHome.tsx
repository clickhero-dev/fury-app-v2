import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout, PageHeader, Button, Card, StatusBadge, EmptyState, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { MOCK_ASSETS } from '@/lib/studio-mock';
import type { StudioAsset } from '@/types/studio';

type AssetType = 'all' | 'image' | 'copy' | 'video';
type ComplianceStatus = 'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

export function EstudioHome() {
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<AssetType>('all');
  const [filterStatus, setFilterStatus] = useState<ComplianceStatus>('all');

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

  const assetList = data?.assets || MOCK_ASSETS;

  const filteredAssets = useMemo(() => {
    return assetList.filter((asset) => {
      const matchesType = filterType === 'all' || asset.type === filterType;
      const matchesStatus = filterStatus === 'all' || asset.complianceStatus === filterStatus;
      return matchesType && matchesStatus;
    });
  }, [assetList, filterType, filterStatus]);

  const typeOptions: Array<{ value: AssetType; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'image', label: 'Imagens' },
    { value: 'copy', label: 'Copy' },
    { value: 'video', label: 'Vídeos' },
  ];

  const statusOptions: Array<{ value: ComplianceStatus; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendente' },
    { value: 'pending_compliance', label: 'Pendência Compliance' },
    { value: 'approved', label: 'Aprovado' },
    { value: 'rejected', label: 'Reprovado' },
  ];

  const getTypeCount = (type: AssetType) => {
    if (type === 'all') return assetList.length;
    return assetList.filter((a) => a.type === type).length;
  };

  const getStatusCount = (status: ComplianceStatus) => {
    if (status === 'all') return assetList.length;
    return assetList.filter((a) => a.complianceStatus === status).length;
  };

  const handleGenerateImageClick = () => {
    navigate('/estudio/imagem');
  };

  const handleGenerateCopyClick = () => {
    navigate('/estudio/copy');
  };

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Estúdio Criativo</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateCopyClick}
            >
              + Gerar Copy
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateImageClick}
              className="bg-[#E8631A] hover:bg-[#D45714]"
            >
              + Gerar Imagem
            </Button>
          </div>
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
          <div className="p-6 space-y-4">
            {/* Type Filters */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Tipo</h3>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterType(option.value)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      filterType === option.value
                        ? 'bg-[#E8631A] text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {option.label}
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
                      {getTypeCount(option.value)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filters */}
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-text-primary">Status</h3>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterStatus(option.value)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                      filterStatus === option.value
                        ? 'bg-[#E8631A] text-white'
                        : 'bg-surface-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {option.label}
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
                      {getStatusCount(option.value)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : filteredAssets.length === 0 ? (
          <EmptyState
            title={assetList.length === 0 ? 'Gere seu primeiro criativo com IA' : 'Nenhum ativo encontrado com os filtros aplicados'}
            description={assetList.length === 0 ? 'Clique no botão acima para começar a gerar criativos incríveis' : 'Ajuste os filtros ou gere novos criativos'}
            action={{
              label: 'Gerar Novo Criativo',
              onClick: handleGenerateImageClick,
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredAssets.map((asset) => (
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
                      {asset.name ?? `Criativo de ${asset.type === 'image' ? 'imagem' : asset.type}`}
                    </h3>
                  </div>

                  <StatusBadge status={asset.complianceStatus} />

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
