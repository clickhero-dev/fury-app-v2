import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { AppLayout, Button, Card, CardContent, EmptyState, LoadingSpinner } from '@/components';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import api from '@/lib/api';
import type { StudioAsset, GenerateCreativeResponse } from '@/types/studio';
import { CreativeResult } from './components/CreativeResult';

type ViewState = 'library' | 'loading' | 'result' | 'error' | 'quick-create';

// Vídeos ainda não são suportados no backend, reativar quando estiver pronto
const FEATURES = {
  videoAnuncios: false,
};

// ponytail: só imagem, só flux.2 max — sem seletor de tipo nem modelo
const CREATIVE_TYPE = 'image' as const;
const IMAGE_MODEL = 'black-forest-labs/flux.2-max';

interface StudioAssetResponse {
  assets: StudioAsset[];
  creativesRemaining: number | null;
  creativesLimit: number | null;
}

export function EstudioHome() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>('library');
  const [generationResult, setGenerationResult] = useState<GenerateCreativeResponse | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Wizard state ─────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardAsset, setWizardAsset] = useState<{ id: string; url: string | null } | null>(null);

  // ─── OpenRouter state ──────────────────────────────────────────────
  const [orPrompt, setOrPrompt] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | null>(null);

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
        modificationsRemaining: data.modificationsRemaining ?? null,
      });
      setView('result');
      setProgressMessage('');
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
    onError: (error: any) => {
      setView('error');
      setProgressMessage('');
      setQuotaErrorMessage(error?.response?.data?.error?.message ?? null);
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

  const assetList = data?.assets ?? [];
  const creativesRemaining = data?.creativesRemaining ?? null;
  const creativesLimit = data?.creativesLimit ?? null;
  const quotaReached = creativesRemaining !== null && creativesRemaining <= 0;

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
    setQuotaErrorMessage(null);
    setView('quick-create');
  };
  const handleQuickCreate = async () => {
    const finalPrompt = orPrompt.trim();
    if (finalPrompt.length < 10) return;
    setView('loading');
    setProgressMessage('Aprimorando explicação detalhada...');

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
    setGenerationResult({
      type: CREATIVE_TYPE,
      assetId: asset.id,
      imageUrl: asset.url ?? '',
      creativeData,
      modificationsRemaining: asset.modificationsRemaining ?? null,
    });
    setView('result');
  };
  const handleUseInCampaign = (asset: StudioAsset) => {
    setWizardAsset({ id: asset.id, url: asset.url });
    setWizardOpen(true);
  };

  const typeOptions: Array<{ value: 'all' | 'image' | 'video'; label: string }> = [
    { value: 'all' as const, label: 'Todos' },
    { value: 'image' as const, label: 'Imagens' },
    ...(FEATURES.videoAnuncios ? [{ value: 'video' as const, label: 'Vídeos' }] : []),
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
        <h2 className="text-lg font-bold text-text-primary">Estúdio de Anúncios</h2>
      ) : (
        <>
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Biblioteca
          </button>
          <h2 className="text-lg font-bold text-text-primary">
            {view === 'quick-create' && 'Criação Rápida'}
            {view === 'loading' && 'Gerando...'}
            {view === 'result' && 'Seu Anúncio'}
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
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-text-tertiary">
                <span className="flex items-center gap-2">
                  <span className="text-base">✨</span>
                  Descreva o anúncio que deseja
                </span>
                <span className="text-border hidden sm:block">→</span>
                <span className="flex items-center gap-2">
                  <span className="text-base">🤖</span>
                  A IA cria a imagem para você
                </span>
                <span className="text-border hidden sm:block">→</span>
                <span className="flex items-center gap-2">
                  <span className="text-base">📤</span>
                  Publique direto no Meta
                </span>
              </div>

              <Button
                onClick={handleStartQuickCreate}
                disabled={quotaReached}
                className="inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white px-8 py-3 text-base font-semibold rounded-2xl h-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={18} />
                Criação Rápida
              </Button>

              {creativesRemaining !== null && (
                <p className={`text-xs font-semibold ${quotaReached ? 'text-red-600' : 'text-text-tertiary'}`}>
                  {quotaReached
                    ? 'Limite de criativos do mês atingido — faça upgrade do plano para continuar'
                    : `${creativesRemaining}${creativesLimit !== null ? ` de ${creativesLimit}` : ''} criativo${creativesRemaining !== 1 ? 's' : ''} restante${creativesRemaining !== 1 ? 's' : ''} este mês`}
                </p>
              )}
            </div>

            {/* Library */}
            <div className="border-t border-border pt-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-text-primary">Biblioteca de Anúncios</h3>
                <span className="text-sm text-text-tertiary">
                  {assetList.length} ativo{assetList.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-xl">
                <span className="text-xs font-semibold text-text-tertiary shrink-0">Tipo:</span>
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterType(option.value)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold text-xs transition-all ${
                      filterType === option.value
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-surface-secondary text-text-tertiary hover:bg-border-light'
                    }`}
                  >
                    {option.label}
                    <span className={`text-[10px] font-bold ${filterType === option.value ? 'opacity-80' : 'opacity-60'}`}>
                      {getTypeCount(option.value)}
                    </span>
                  </button>
                ))}

                <span className="border-l border-border self-stretch mx-1" />

                <span className="text-xs font-semibold text-text-tertiary shrink-0">Status:</span>
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFilterStatus(option.value)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold text-xs transition-all ${
                      filterStatus === option.value
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-surface-secondary text-text-tertiary hover:bg-border-light'
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
                  title={assetList.length === 0 ? 'Gere seu primeiro anúncio com IA' : 'Nenhum ativo com esses filtros'}
                  description={
                    assetList.length === 0
                      ? 'Clique em "Criação Rápida" para começar'
                      : 'Ajuste os filtros ou crie novos anúncios'
                  }
                  action={{ label: 'Criar Anúncio', onClick: handleStartQuickCreate }}
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
                      onUseInCampaign={() => handleUseInCampaign(asset)}
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
              <p className="text-sm text-text-tertiary">Descreva o anúncio que deseja gerar para criar a imagem ideal</p>
            </div>

            {quotaReached && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Limite de criativos do mês atingido — faça upgrade do plano para continuar.
              </div>
            )}

            {/* Prompt */}
            <Card>
              <CardContent className="space-y-4">
                <label className="text-sm font-semibold text-text-primary">Descreva o anúncio</label>
                <textarea
                  value={orPrompt}
                  onChange={(e) => setOrPrompt(e.target.value)}
                  placeholder="Ex: Anúncio fashion minimalista com luz natural, modelo feminina, fundo branco, cores suaves..."
                  className="min-h-36 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
                />
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span>{orPrompt.trim().length}/1000</span>
                  <span>Imagem • explicação detalhada = melhor resultado</span>
                </div>
                <Button
                  onClick={handleQuickCreate}
                  disabled={orPrompt.trim().length < 10 || orImageMutation.isPending || quotaReached}
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
              <h2 className="text-2xl font-bold text-text-primary">
                {progressMessage || 'O FURY está criando sua imagem...'}
              </h2>
              <p className="mt-2 text-sm text-text-tertiary">
                A geração com IA e a renderização podem levar até 15 segundos
              </p>
            </div>
            <div className="flex flex-col gap-1 text-xs text-text-tertiary">
              <span>✦ Aprimorando a explicação detalhada com o contexto da marca</span>
              <span>✦ Gerando imagem com IA</span>
              <span>✦ Salvando na biblioteca</span>
            </div>
          </div>
        )}

        {/* RESULT VIEW */}
        {view === 'result' && generationResult && (
          <>
            <div className="pt-2">
              <p className="text-sm text-text-tertiary">Regenere com ajustes, salve ou publique direto no Meta</p>
            </div>
            <CreativeResult
              result={generationResult}
              onBack={handleBackToLibrary}
              onNewCreative={handleStartQuickCreate}
              onPublish={() => {
                setWizardAsset({ id: generationResult.assetId, url: generationResult.imageUrl });
                setWizardOpen(true);
              }}
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
              <h2 className="text-2xl font-bold text-text-primary">Não foi possível gerar o anúncio</h2>
              <p className="mt-2 text-sm text-text-tertiary">
                {quotaErrorMessage ?? 'Verifique sua conexão e tente novamente'}
              </p>
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

      <CampaignWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        preSelectedAssetId={wizardAsset?.id}
        preSelectedAssetUrl={wizardAsset?.url ?? undefined}
      />
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
  onUseInCampaign: () => void;
}

// ponytail: relative URLs resolved against API origin, fallback for local dev
const BACKEND_URL = api.defaults.baseURL?.replace(/\/api$/, '') ?? '';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
}

function AssetCard({ asset, isDeleting, deletePending, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onViewDetails, onUseInCampaign }: AssetCardProps) {
  const imageUrl = resolveAssetUrl(asset.url);
  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
      {imageUrl && asset.type === 'image' ? (
        <div className="relative w-full aspect-square bg-surface-secondary overflow-hidden">
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
            {asset.name ?? `Anúncio de ${asset.type === 'image' ? 'imagem' : asset.type}`}
          </h3>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="shrink-0 p-1 rounded text-text-secondary hover:text-red-500 hover:bg-error-light transition-colors"
            title="Excluir anúncio"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {isDeleting ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-red-600 font-medium">Excluir este anúncio?</p>
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
            <button onClick={onUseInCampaign} className="flex-1 px-3 py-2 border border-[#EA580C] text-[#EA580C] rounded-lg text-xs font-semibold hover:bg-[#FEF0E7] transition-colors">
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
