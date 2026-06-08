import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { AppLayout, PageHeader, Button, Card, StatusBadge, EmptyState, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { MOCK_ASSETS } from '@/lib/studio-mock';
import type {
  StudioAsset,
  GenerateCreativePayload,
  GenerateCreativeResponse,
  StyleTemplate,
} from '@/types/studio';
import { TemplateGallery } from './components/TemplateGallery';
import { CreativeWizard } from './components/CreativeWizard';
import { CreativeResult } from './components/CreativeResult';

type ViewState = 'library' | 'wizard' | 'loading' | 'result' | 'error';
type AssetType = 'all' | 'image' | 'video';
type ComplianceStatus = 'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

export function EstudioHome() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>('library');
  const [selectedTemplate, setSelectedTemplate] = useState<StyleTemplate | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerateCreativeResponse | null>(null);
  const [filterType, setFilterType] = useState<AssetType>('all');
  const [filterStatus, setFilterStatus] = useState<ComplianceStatus>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (payload: GenerateCreativePayload) => {
      const res = await api.post<GenerateCreativeResponse>('/studio/creative/generate', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setGenerationResult(data);
      setView('result');
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
    onError: () => {
      setView('error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await api.delete(`/studio/assets/${assetId}`);
    },
    onSuccess: () => {
      setDeletingId(null);
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
    onError: () => {
      setDeletingId(null);
    },
  });

  const { data, isLoading } = useQuery<StudioAssetResponse>({
    queryKey: ['studio/assets'],
    queryFn: async () => {
      const response = await api.get('/studio/assets');
      return response.data;
    },
    retry: 2,
  });

  const assetList = data?.assets ?? MOCK_ASSETS;

  const filteredAssets = useMemo(() => {
    return assetList.filter((asset) => {
      const matchesType = filterType === 'all' || asset.type === filterType;
      const matchesStatus = filterStatus === 'all' || asset.complianceStatus === filterStatus;
      return matchesType && matchesStatus;
    });
  }, [assetList, filterType, filterStatus]);

  const handleGenerate = (payload: GenerateCreativePayload) => {
    setView('loading');
    generateMutation.mutate(payload);
  };

  const handleStartWizard = () => setView('wizard');
  const handleBackToLibrary = () => {
    setView('library');
    setGenerationResult(null);
  };
  const handleNewCreative = () => {
    setGenerationResult(null);
    setView('wizard');
  };

  const typeOptions: Array<{ value: AssetType; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'image', label: 'Imagens' },
    { value: 'video', label: 'Vídeos' },
  ];

  const statusOptions: Array<{ value: ComplianceStatus; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendente' },
    { value: 'pending_compliance', label: 'Em Compliance' },
    { value: 'approved', label: 'Aprovado' },
    { value: 'rejected', label: 'Reprovado' },
  ];

  const getTypeCount = (type: AssetType) => (type === 'all' ? assetList.length : assetList.filter((a) => a.type === type).length);
  const getStatusCount = (status: ComplianceStatus) => (status === 'all' ? assetList.length : assetList.filter((a) => a.complianceStatus === status).length);

  const header = (
    <div className="flex items-center justify-between">
      {view === 'library' ? (
        <>
          <h2 className="text-lg font-bold text-text-primary">Estúdio Criativo</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartWizard}
            className="bg-[#E8631A] hover:bg-[#D45714]"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Criar Novo Anúncio
          </Button>
        </>
      ) : (
        <>
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#667085] hover:text-[#101828] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Biblioteca
          </button>
          <h2 className="text-lg font-bold text-text-primary">
            {view === 'wizard' && 'Novo Criativo'}
            {view === 'loading' && 'Gerando...'}
            {view === 'result' && 'Seu Criativo'}
            {view === 'error' && 'Erro na geração'}
          </h2>
        </>
      )}
    </div>
  );

  return (
    <AppLayout header={header}>
      <div className="space-y-8">
        {/* LIBRARY VIEW */}
        {view === 'library' && (
          <>
            <PageHeader
              title="Estúdio Criativo"
              description="Crie anúncios com IA em minutos — do briefing ao criativo final"
            />

            <TemplateGallery
              selectedTemplate={selectedTemplate}
              onSelect={setSelectedTemplate}
              onStartWizard={handleStartWizard}
            />

            <div className="border-t border-[#E6E8EC] pt-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#101828]">Biblioteca de Criativos</h3>
                <span className="text-sm text-[#667085]">{assetList.length} ativo{assetList.length !== 1 ? 's' : ''}</span>
              </div>

              <Card>
                <div className="p-6 space-y-4">
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-text-primary">Tipo</h4>
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

                  <div className="space-y-3 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-text-primary">Status</h4>
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

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : filteredAssets.length === 0 ? (
                <EmptyState
                  title={assetList.length === 0 ? 'Gere seu primeiro criativo com IA' : 'Nenhum ativo com esses filtros'}
                  description={assetList.length === 0 ? 'Clique em "Criar Novo Anúncio" para começar' : 'Ajuste os filtros ou crie novos criativos'}
                  action={{ label: 'Criar Novo Anúncio', onClick: handleStartWizard }}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      isDeleting={deletingId === asset.id}
                      deletePending={deleteMutation.isPending}
                      onDeleteRequest={() => setDeletingId(asset.id)}
                      onDeleteConfirm={() => deleteMutation.mutate(asset.id)}
                      onDeleteCancel={() => setDeletingId(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* WIZARD VIEW */}
        {view === 'wizard' && (
          <>
            <PageHeader
              title="Novo Anúncio"
              description="Responda as perguntas abaixo — o FURY cria o criativo completo para você"
            />
            <CreativeWizard
              selectedTemplate={selectedTemplate}
              onGenerate={handleGenerate}
              onBack={handleBackToLibrary}
            />
          </>
        )}

        {/* LOADING VIEW */}
        {view === 'loading' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-5">
            <div className="rounded-full bg-[#FFF4ED] p-5">
              <Loader2 className="h-10 w-10 animate-spin text-[#E8631A]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#101828]">O FURY está criando seu anúncio...</h2>
              <p className="mt-2 text-sm text-[#667085]">A geração com IA e a renderização podem levar até 15 segundos</p>
            </div>
            <div className="flex flex-col gap-1 text-xs text-[#667085]">
              <span>✦ Analisando seu briefing</span>
              <span>✦ Gerando textos e layout</span>
              <span>✦ Renderizando o criativo</span>
            </div>
          </div>
        )}

        {/* RESULT VIEW */}
        {view === 'result' && generationResult && (
          <>
            <PageHeader
              title="Seu Criativo Está Pronto"
              description="Edite os textos, regenere ou publique direto no Meta"
            />
            <CreativeResult
              result={generationResult}
              onBack={handleBackToLibrary}
              onNewCreative={handleNewCreative}
            />
          </>
        )}

        {/* ERROR VIEW */}
        {view === 'error' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-5">
            <div className="rounded-full bg-red-50 p-5">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#101828]">Não foi possível gerar o criativo</h2>
              <p className="mt-2 text-sm text-[#667085]">Verifique sua conexão e tente novamente</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setView('wizard')} className="bg-[#E8631A] hover:bg-[#D45714]">
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={handleBackToLibrary}>
                Voltar para Biblioteca
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

interface AssetCardProps {
  asset: StudioAsset;
  isDeleting: boolean;
  deletePending: boolean;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function AssetCard({ asset, isDeleting, deletePending, onDeleteRequest, onDeleteConfirm, onDeleteCancel }: AssetCardProps) {
  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
      {asset.url && asset.type === 'image' ? (
        <div className="relative w-full aspect-square bg-surface-secondary overflow-hidden">
          <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-square bg-gradient-to-br from-[#FEF0E7] to-[#FFE8D6] flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-[#E8631A]/40" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-text-primary text-sm flex-1 line-clamp-2">
            {asset.name ?? `Criativo de ${asset.type === 'image' ? 'imagem' : asset.type}`}
          </h3>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="shrink-0 p-1 rounded text-text-secondary hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Excluir criativo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <StatusBadge status={asset.complianceStatus} />

        {isDeleting ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-red-600 font-medium">Excluir este criativo?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={deletePending}
                className="flex-1 px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deletePending ? 'Excluindo...' : 'Confirmar'}
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="flex-1 px-3 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-surface-secondary transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <button className="flex-1 px-3 py-2 border border-[#E8631A] text-[#E8631A] rounded-lg text-xs font-semibold hover:bg-[#FEF0E7] transition-colors">
              Usar em campanha
            </button>
            <button className="flex-1 px-3 py-2 bg-[#E8631A] text-white rounded-lg text-xs font-semibold hover:bg-[#D45714] transition-colors">
              Ver detalhes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
