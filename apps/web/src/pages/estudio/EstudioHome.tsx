import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { AppLayout, Button, Card, CardContent, EmptyState, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { MOCK_ASSETS } from '@/lib/studio-mock';
import type { StudioAsset, GenerateCreativePayload, GenerateCreativeResponse } from '@/types/studio';
import { CreativeResult } from './components/CreativeResult';

type ViewState = 'library' | 'loading' | 'result' | 'error' | 'quick-create';

// ponytail: só imagem, só flux.2 max — sem seletor de tipo nem modelo
const CREATIVE_TYPE = 'image' as const;
const IMAGE_MODEL = 'black-forest-labs/flux.2-max';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

export function EstudioHome() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>('library');
  const [generationResult, setGenerationResult] = useState<GenerateCreativeResponse | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── OpenRouter state ──────────────────────────────────────────────
  const [orPrompt, setOrPrompt] = useState('');
  const [progressMessage, setProgressMessage] = useState('');

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

  // ─── OpenRouter image mutation (sempre flux.2 max) ─────────────────
  const orImageMutation = useMutation({
    mutationFn: async (payload: { model: string; prompt: string }) => {
      setProgressMessage('Gerando imagem...');
      const res = await api.post('/openrouter/generate-image', payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      setGenerationResult({
        type: 'image',
        assetId: data.creativeAssetId,
        imageUrl: data.imageUrl,
        creativeData: { headline: '', primary_text: '', cta: '' },
      });
      setView('result');
      setProgressMessage('');
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
    onError: () => { setView('error'); setProgressMessage(''); },
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

  // ponytail: removido handleGenerate / handleSaveToLibrary / handleStartWizard / handleNewCreative

  const handleStartQuickCreate = () => {
    setOrPrompt('');
    setView('quick-create');
  };
  const handleQuickCreate = async () => {
    const finalPrompt = orPrompt.trim();
    if (finalPrompt.length < 10) return;
    setView('loading');
    setProgressMessage('Aprimorando prompt...');

    try {
      const enhanceRes = await api.post('/openrouter/enhance-prompt', {
        prompt: finalPrompt,
        type: CREATIVE_TYPE,
      });
      const { enhancedPrompt } = enhanceRes.data as { enhancedPrompt: string };
      setProgressMessage('Gerando imagem...');
      orImageMutation.mutate({ model: IMAGE_MODEL, prompt: enhancedPrompt });
    } catch {
      setProgressMessage('Gerando imagem...');
      orImageMutation.mutate({ model: IMAGE_MODEL, prompt: finalPrompt });
    }
  };
  const handleBackToLibrary = () => {
    setView('library');
    setGenerationResult(null);
  };

  const handleViewDetails = (asset: StudioAsset) => {
    let creativeData = { headline: '', primary_text: '', cta: '', subheadline: '', layout: '', color_scheme: '' };
    try {
      const meta = JSON.parse(asset.complianceNotes ?? '{}');
      if (meta.headline) creativeData = { headline: meta.headline, primary_text: meta.primary_text ?? '', cta: meta.cta ?? '', subheadline: meta.subheadline ?? '', layout: meta.layout ?? '', color_scheme: meta.color_scheme ?? '' };
    } catch { /* use empty fallback */ }
    setGenerationResult({ assetId: asset.id, imageUrl: asset.url ?? '', creativeData });
    setView('result');
  };

  const typeOptions: Array<{ value: 'all' | 'image' | 'video'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'image', label: 'Imagens' },
    { value: 'video', label: 'Vídeos' },
  ];

  const statusOptions: Array<{ value: 'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected'; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'pending_compliance', label: 'Gerado' },
    { value: 'approved', label: 'Pronto' },
  ];

  const getTypeCount = (type: string) =>
    type === 'all' ? assetList.length : assetList.filter((a) => a.type === type).length;
  const getStatusCount = (status: string) =>
    status === 'all' ? assetList.length : assetList.filter((a) => a.complianceStatus === status).length;

  const header = (
    <div className="flex items-center justify-between">
      {view === 'library' ? (
        <h2 className="text-lg font-bold text-text-primary">Estúdio Criativo</h2>
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
            {view === 'quick-create' && 'Criação Rápida'}
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
      <div className="space-y-10">

        {/* LIBRARY VIEW */}
        {view === 'library' && (
          <>
            {/* Hero — só criação rápida */}
            <div className="flex flex-col items-center text-center pt-4 pb-2 space-y-4">
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-[#667085]">
                <span className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  Descreva o criativo que deseja
                </span>
                <span className="text-[#D1D5DB] hidden sm:block">→</span>
                <span className="flex items-center gap-2">
                  <span className="text-base">🤖</span>
                  A IA cria a imagem para você
                </span>
                <span className="text-[#D1D5DB] hidden sm:block">→</span>
                <span className="flex items-center gap-2">
                  <span className="text-base">📤</span>
                  Publique direto no Meta
                </span>
              </div>

              <Button
                onClick={handleStartQuickCreate}
                className="inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white px-8 py-3 text-base font-semibold rounded-2xl h-auto"
              >
                <Sparkles size={18} />
                Criação Rápida
              </Button>
            </div>

            {/* Library */}
            <div className="border-t border-[#E6E8EC] pt-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#101828]">Biblioteca de Criativos</h3>
                <span className="text-sm text-[#667085]">
                  {assetList.length} ativo{assetList.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-white border border-[#E6E8EC] rounded-xl">
                <span className="text-xs font-semibold text-[#667085] shrink-0">Tipo:</span>
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterType(option.value)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold text-xs transition-all ${
                      filterType === option.value
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-[#F2F4F7] text-[#667085] hover:bg-[#E6E8EC]'
                    }`}
                  >
                    {option.label}
                    <span className={`text-[10px] font-bold ${filterType === option.value ? 'opacity-80' : 'opacity-60'}`}>
                      {getTypeCount(option.value)}
                    </span>
                  </button>
                ))}

                <span className="border-l border-[#E6E8EC] self-stretch mx-1" />

                <span className="text-xs font-semibold text-[#667085] shrink-0">Status:</span>
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterStatus(option.value)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold text-xs transition-all ${
                      filterStatus === option.value
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-[#F2F4F7] text-[#667085] hover:bg-[#E6E8EC]'
                    }`}
                  >
                    {option.label}
                    <span className={`text-[10px] font-bold ${filterStatus === option.value ? 'opacity-80' : 'opacity-60'}`}>
                      {getStatusCount(option.value)}
                    </span>
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : filteredAssets.length === 0 ? (
                <EmptyState
                  title={assetList.length === 0 ? 'Gere seu primeiro criativo com IA' : 'Nenhum ativo com esses filtros'}
                  description={
                    assetList.length === 0
                      ? 'Clique em "Criação Rápida" para começar'
                      : 'Ajuste os filtros ou crie novos criativos'
                  }
                  action={{ label: 'Criar Criativo', onClick: handleStartQuickCreate }}
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
                      onViewDetails={() => handleViewDetails(asset)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* QUICK CREATE VIEW — só imagem, flux.2 max */}
        {view === 'quick-create' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="pt-2">
              <p className="text-sm text-[#667085]">Descreva o criativo que deseja gerar — o FURY usa FLUX.2 Max para máxima qualidade</p>
            </div>

            {/* Prompt */}
            <Card>
              <CardContent className="space-y-4">
                <label className="text-sm font-semibold text-[#101828]">Descreva o criativo</label>
                <textarea
                  value={orPrompt}
                  onChange={(e) => setOrPrompt(e.target.value)}
                  placeholder="Ex: Anúncio fashion minimalista com luz natural, modelo feminina, fundo branco, cores suaves..."
                  className="min-h-36 w-full rounded-2xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
                />
                <div className="flex items-center justify-between text-xs text-[#667085]">
                  <span>{orPrompt.trim().length}/1000</span>
                  <span>Imagem • prompt detalhado = melhor resultado</span>
                </div>
                <Button
                  onClick={handleQuickCreate}
                  disabled={orPrompt.trim().length < 10 || orImageMutation.isPending}
                  className="w-full bg-[#E8631A] hover:bg-[#D45714]"
                >
                  {orImageMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Gerar Imagem
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* LOADING VIEW */}
        {view === 'loading' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-5">
            <div className="rounded-full bg-[#FFF4ED] p-5">
              <Loader2 className="h-10 w-10 animate-spin text-[#EA580C]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#101828]">
                {progressMessage || 'O FURY está criando sua imagem...'}
              </h2>
              <p className="mt-2 text-sm text-[#667085]">
                A geração com IA e a renderização podem levar até 15 segundos
              </p>
            </div>
            <div className="flex flex-col gap-1 text-xs text-[#667085]">
              <span>✦ Aprimorando o prompt com o contexto da marca</span>
              <span>✦ Gerando imagem via FLUX.2 Max</span>
              <span>✦ Salvando na biblioteca</span>
            </div>
          </div>
        )}

        {/* RESULT VIEW */}
        {view === 'result' && generationResult && (
          <>
            <div className="pt-2">
              <p className="text-sm text-[#667085]">Regenere com ajustes, salve ou publique direto no Meta</p>
            </div>
            <CreativeResult
              result={generationResult}
              onBack={handleBackToLibrary}
              onNewCreative={handleStartQuickCreate}
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
              <Button onClick={handleStartQuickCreate} className="bg-[#EA580C] hover:bg-[#C2410C] text-white">
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
  onViewDetails: () => void;
}

// ponytail: relative URLs resolved against API origin, fallback for local dev
const BACKEND_URL = api.defaults.baseURL?.replace(/\/api$/, '') ?? '';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
}

function AssetCard({ asset, isDeleting, deletePending, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onViewDetails }: AssetCardProps) {
  const imageUrl = resolveAssetUrl(asset.url);
  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
      {imageUrl && asset.type === 'image' ? (
        <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
          <img
            src={imageUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('=== AssetCard image failed:', imageUrl);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="w-full aspect-square bg-gradient-to-br from-[#FEF0E7] to-[#FFE8D6] flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-[#EA580C]/40" />
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
            <button className="flex-1 px-3 py-2 border border-[#EA580C] text-[#EA580C] rounded-lg text-xs font-semibold hover:bg-[#FEF0E7] transition-colors">
              Usar em campanha
            </button>
            <button
              onClick={onViewDetails}
              className="flex-1 px-3 py-2 bg-[#EA580C] text-white rounded-lg text-xs font-semibold hover:bg-[#C2410C] transition-colors"
            >
              Ver detalhes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
