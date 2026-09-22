import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Image as ImageIcon, Loader2, RectangleVertical, Send, Sparkles, Square, Trash2, Upload, Wand2, X } from 'lucide-react';
import { AppLayout, Card, CardContent, LoadingSpinner, PageHeader } from '@/components';
import { useCampaignWizardContext } from '@/contexts/CampaignWizardContext';
import { ModelSelect, type StudioModelOption } from '@/components/studio/ModelSelect';
import { UsageBadge } from '@/components/UsageBadge';
import { useUploadPhotos } from '@/hooks/useBrandKit';
import api from '@/lib/api';
import { complianceBadge } from '@/lib/compliance.utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { StudioAsset, GenerateCreativeResponse } from '@/types/studio';
import { CreativeResult } from './components/CreativeResult';
import { ArchiveConfirmDialog } from './components/ArchiveConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArchivedAssetsModal } from './components/ArchivedAssetsModal';
import { ReferenceImagePanel } from './components/ReferenceImagePanel';

type ViewState = 'library' | 'loading' | 'result' | 'error' | 'quick-create';

const FEATURES = {
  videoAnuncios: false,
};

const CREATIVE_TYPE = 'image' as const;
const IMAGE_MODEL = 'black-forest-labs/flux.2-pro';

/* ── Estilos com efeito de Hover estilo Campanhas e Tokens Semânticos ── */
const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const CARD_HOVER = 'transition-all duration-300 ease-in-out hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:-translate-y-0.5';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

const CHIP_ON = 'bg-brand text-brand-foreground font-semibold shadow-sm';
const CHIP_OFF = 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover font-medium';

interface StudioAssetResponse {
  assets: StudioAsset[];
  creativesRemaining: number | null;
  creativesLimit: number | null;
}

export function EstudioHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPreSelectedAsset } = useCampaignWizardContext();
  const [view, setView] = useState<ViewState>('library');
  const [generationResult, setGenerationResult] = useState<GenerateCreativeResponse | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'pending_compliance' | 'approved' | 'rejected'>('all');
  const [confirmArchiveAsset, setConfirmArchiveAsset] = useState<StudioAsset | null>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ─── OpenRouter state ──────────────────────────────────────────────
  const [orPrompt, setOrPrompt] = useState('');
  const [orAspectRatio, setOrAspectRatio] = useState<'1:1' | '9:16'>('1:1');
  const [referenceContextUrls, setReferenceContextUrls] = useState<string[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | null>(null);
  const [selectedImageModel, setSelectedImageModel] = useState(IMAGE_MODEL);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = generationStartedAt ? Math.max(0, Math.round((nowMs - generationStartedAt) / 1000)) : 0;

  const modelsQuery = useQuery({
    queryKey: ['studio-ai', 'models'],
    queryFn: async () => {
      const res = await api.get('/studio/ai/models');
      return res.data as { image: StudioModelOption[]; video: StudioModelOption[] };
    },
    staleTime: 1000 * 60 * 60, // 1h
  });
  const imageModels = modelsQuery.data?.image ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await api.delete(`/studio/assets/${assetId}`);
    },
    onSuccess: () => {
      setConfirmArchiveAsset(null);
      setToast({ message: 'Criativo arquivado com sucesso', type: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => {
      setToast({ message: 'Erro ao arquivar o criativo. Tente novamente.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const orImageMutation = useMutation({
    mutationFn: async (payload: { model: string; prompt: string; aspect_ratio: '1:1' | '9:16'; reference_image_urls?: string[] }) => {
      setProgressMessage('Gerando imagem...');
      const res = await api.post('/studio/ai/generate-image', payload);
      return res.data;
    },
    onSuccess: (data: { creativeAssetId: string; imageUrl: string; modificationsRemaining?: number | null }) => {
      setGenerationResult({
        type: 'image',
        assetId: data.creativeAssetId,
        imageUrl: data.imageUrl,
        creativeData: { headline: '', primary_text: '', cta: '' },
        modificationsRemaining: data.modificationsRemaining ?? null,
      });
      setGenerationStartedAt(null);
      setView('result');
      setProgressMessage('');
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
    onError: (error: { response?: { data?: { error?: { message?: string } } } }) => {
      setGenerationStartedAt(null);
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

  const handleStartQuickCreate = () => {
    setOrPrompt('');
    setQuotaErrorMessage(null);
    setReferenceContextUrls([]);
    setView('quick-create');
  };

  // Regra de precedência (Decisão 6, plan.md): contexto atual = últimas até
  // 2 imagens adicionadas, venham do painel lateral (RF-09) ou do Upload B
  // (RF-10, Fase 5) — mesma função pras duas origens.
  const MAX_REFERENCE_CONTEXT = 2;
  const addToReferenceContext = (urls: string[]) => {
    setReferenceContextUrls((prev) => {
      const combined = [...prev, ...urls];
      if (combined.length > MAX_REFERENCE_CONTEXT) {
        setToast({ message: 'Limite de 2 imagens de referência — a mais antiga foi substituída.', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
      return combined.slice(-MAX_REFERENCE_CONTEXT);
    });
  };

  const removeFromReferenceContext = (url: string) => {
    setReferenceContextUrls((prev) => prev.filter((u) => u !== url));
  };

  // Upload B (RF-10) — separado do painel lateral: no máximo 2 arquivos por
  // vez, salva na mesma biblioteca (Upload A/painel reflete junto) E já
  // entra automaticamente no contexto da geração, sem passo de seleção.
  const uploadReferenceB = useUploadPhotos();
  const [showUploadBLimitAlert, setShowUploadBLimitAlert] = useState(false);
  const handleUploadB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (files.length > 2) {
      setShowUploadBLimitAlert(true);
      e.target.value = '';
      return;
    }
    uploadReferenceB.mutate(files, {
      onSuccess: (data) => addToReferenceContext(data.urls),
    });
    e.target.value = '';
  };

  const handleQuickCreate = async () => {
    const finalPrompt = orPrompt.trim();
    if (finalPrompt.length < 10) return;
    setView('loading');
    setProgressMessage('Aprimorando explicação detalhada...');
    // cronômetro começa no clique — cobre enhance-prompt + geração
    setGenerationStartedAt(Date.now());

    try {
      const enhanceRes = await api.post('/studio/ai/enhance-prompt', {
        prompt: finalPrompt,
        type: CREATIVE_TYPE,
      });
      const { enhancedPrompt } = enhanceRes.data as { enhancedPrompt: string };
      setProgressMessage('Gerando imagem...');
      orImageMutation.mutate({
        model: selectedImageModel,
        prompt: enhancedPrompt,
        aspect_ratio: orAspectRatio,
        reference_image_urls: referenceContextUrls.length ? referenceContextUrls : undefined,
      });
    } catch {
      setProgressMessage('Gerando imagem...');
      orImageMutation.mutate({
        model: selectedImageModel,
        prompt: finalPrompt,
        aspect_ratio: orAspectRatio,
        reference_image_urls: referenceContextUrls.length ? referenceContextUrls : undefined,
      });
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
    } catch { /* fallback */ }
    setGenerationResult({
      type: CREATIVE_TYPE,
      assetId: asset.id,
      imageUrl: asset.url ?? '',
      creativeData,
      complianceStatus: asset.complianceStatus,
      complianceNotes: asset.complianceNotes,
      modificationsRemaining: asset.modificationsRemaining ?? null,
    });
    setView('result');
  };

  const handleUseInCampaign = (asset: StudioAsset) => {
    setPreSelectedAsset({ id: asset.id, url: asset.url ?? undefined });
    navigate('/criar-campanha');
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
    { value: 'rejected', label: 'Reprovado' },
  ];

  const getTypeCount = (type: string) =>
    type === 'all' ? assetList.length : assetList.filter((a) => a.type === type).length;
  const getStatusCount = (status: string) =>
    status === 'all' ? assetList.length : assetList.filter((a) => a.complianceStatus === status).length;

  const steps = [
    { icon: Wand2, label: 'Descreva o anúncio que deseja' },
    { icon: ImageIcon, label: 'O ady cria a imagem para você' },
    { icon: Send, label: 'Publique direto na sua conta' },
  ];

  const renderPageHeader = () => {
    if (view === 'library') {
      return (
        <PageHeader
          title="Estúdio de anúncios"
          description="Peças prontas para publicar, criadas a partir de uma frase"
          actions={<UsageBadge remaining={creativesRemaining} limit={creativesLimit} />}
        />
      );
    }

    const titleMap: Record<ViewState, string> = {
      'library': 'Estúdio de anúncios',
      'quick-create': 'Criação rápida',
      'loading': 'Gerando...',
      'result': 'Seu anúncio',
      'error': 'Erro na geração',
    };

    return (
      <PageHeader
        title={titleMap[view]}
        actions={
          <button
            type="button"
            onClick={handleBackToLibrary}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Biblioteca
          </button>
        }
      />
    );
  };

  return (
    <AppLayout>
      <div className={`mx-auto w-full space-y-6 px-6 pt-2 pb-8 sm:px-10 ${view === 'quick-create' ? '' : 'max-w-5xl'}`}>
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-success text-white'
              : 'bg-error text-white'
          }`}>
            {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
          </div>
        )}
        {renderPageHeader()}

        {/* LIBRARY VIEW */}
        {view === 'library' && (
          <>
            {/* Hero */}
            <section className={`${SURFACE} relative overflow-hidden px-6 py-10`}>
              <div className="relative flex flex-col items-center gap-4 text-center">
                <ol className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
                  {steps.map(({ icon: Icon, label }, i) => (
                    <li key={label} className="flex items-center gap-3">
                      <span className="flex items-center gap-2 text-sm text-text-primary">
                        <Icon className="h-4 w-4 shrink-0 text-brand" />
                        {label}
                      </span>
                      {i < steps.length - 1 ? (
                        <ArrowRight className="hidden h-4 w-4 text-text-tertiary sm:block" />
                      ) : null}
                    </li>
                  ))}
                </ol>

                <div className="flex flex-col items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleStartQuickCreate}
                    disabled={quotaReached}
                    className={`quick-create-btn inline-flex items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-2.5 text-sm font-semibold text-white shadow-md ${BUTTON_HOVER} hover:bg-brand-hover/90 disabled:opacity-50`}
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    Criação rápida
                  </button>
                </div>
              </div>
            </section>

            {/* Library */}
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
                  Biblioteca de anúncios
                </h2>
                <span className="text-sm text-text-tertiary">
                  {assetList.length} ativos
                </span>
              </div>

              {/* Barra de Filtros */}
              <div className={`${SURFACE} flex flex-wrap items-center justify-start gap-6 px-4 py-3 text-sm`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-tertiary">Tipo:</span>
                  <div className="flex items-center gap-1.5">
                  {typeOptions.map((option) => {
                            const isActive = filterType === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setFilterType(option.value)}
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-all ${
                                  isActive ? `chip-active ${CHIP_ON}` : CHIP_OFF
                                }`}
                              >
                                <span className={isActive ? '!text-white' : ''}>{option.label}</span>
                                <span className={`opacity-70 ${isActive ? '!text-white' : ''}`}>
                                  {getTypeCount(option.value)}
                                </span>
                              </button>
                            );
                          })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-tertiary">Status:</span>
                  <div className="flex items-center gap-1.5">
                  {statusOptions.map((option) => {
                  const isActive = filterStatus === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilterStatus(option.value)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-all ${
                        isActive ? CHIP_ON : CHIP_OFF
                      }`}
                    >
                      <span className={isActive ? '!text-white' : ''}>{option.label}</span>
                      <span className={`opacity-70 ${isActive ? '!text-white' : ''}`}>
                        {getStatusCount(option.value)}
                      </span>
                    </button>
                  );
                })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowArchivedModal(true)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-tertiary transition-all hover:bg-surface-hover hover:text-text-primary"
                >
                  Arquivados
                </button>
              </div>

              {isLoading ? (
                <div className={`${SURFACE} flex items-center justify-center px-6 py-20`}>
                  <LoadingSpinner />
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className={`${SURFACE} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                  <p className="text-base font-medium text-text-primary">Crie seu primeiro anúncio com o ady</p>
                  <p className="max-w-sm text-sm text-text-tertiary">
                    Conte em uma frase o que você quer anunciar — o resto é com ele.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartQuickCreate}
                    disabled={quotaReached}
                    className={`mt-2 rounded-full border border-border px-5 py-2 text-xs font-semibold text-text-primary ${BUTTON_HOVER} hover:bg-surface-hover hover:border-brand/40`}
                  >
                    Criar anúncio
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onDeleteRequest={() => setConfirmArchiveAsset(asset)}
                      onViewDetails={() => handleViewDetails(asset)}
                      onUseInCampaign={() => handleUseInCampaign(asset)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* QUICK CREATE VIEW */}
        {view === 'quick-create' && (
          <div className="w-full space-y-5">
            <p className="text-sm text-text-tertiary">
              Descreva o anúncio que deseja gerar para criar a imagem ideal
            </p>

            {quotaReached && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Limite de criativos do mês atingido — faça upgrade do plano para continuar.
              </div>
            )}

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
            <Card className={`${SURFACE} border-0 bg-transparent p-0 shadow-none`}>
              <CardContent className={`${SURFACE} space-y-3 p-5`}>
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  Descreva o anúncio
                </label>
                <textarea
                  value={orPrompt}
                  maxLength={1000}
                  onChange={(e) => setOrPrompt(e.target.value)}
                  placeholder="Ex: Anúncio fashion minimalista com luz natural, modelo feminina, fundo branco, cores suaves..."
                  className="min-h-36 w-full resize-none rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-text-primary placeholder:text-text-disabled outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span>{orPrompt.trim().length}/1000</span>
                  <span>Imagem • explicação detalhada = melhor resultado</span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <ModelSelect
                    models={imageModels}
                    selectedModel={selectedImageModel}
                    onSelect={setSelectedImageModel}
                    id="quick-create-model-select"
                    compact
                  />

                  <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1">
                    <button
                      type="button"
                      onClick={() => setOrAspectRatio('1:1')}
                      aria-pressed={orAspectRatio === '1:1'}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${orAspectRatio === '1:1' ? CHIP_ON : CHIP_OFF}`}
                    >
                      <Square className="h-3.5 w-3.5" />
                      Quadrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrAspectRatio('9:16')}
                      aria-pressed={orAspectRatio === '9:16'}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${orAspectRatio === '9:16' ? CHIP_ON : CHIP_OFF}`}
                    >
                      <RectangleVertical className="h-3.5 w-3.5" />
                      Vertical
                    </button>
                  </div>

                  <label
                    className={`flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 ${
                      uploadReferenceB.isPending ? 'cursor-wait opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      multiple
                      className="hidden"
                      onChange={handleUploadB}
                      disabled={uploadReferenceB.isPending}
                      aria-label="Enviar fotos"
                    />
                    {uploadReferenceB.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Enviar fotos
                      </>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={handleQuickCreate}
                    disabled={orPrompt.trim().length < 10 || orImageMutation.isPending || quotaReached}
                    className={`ml-auto inline-flex items-center justify-center gap-2 rounded-full bg-brand-hover px-5 py-2.5 text-sm font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50`}
                  >
                    {orImageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Gerar imagem
                  </button>
                </div>

                {referenceContextUrls.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-text-tertiary">Referências nesta criação:</span>
                    {referenceContextUrls.map((url) => (
                      <div key={url} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-brand">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeFromReferenceContext(url)}
                          aria-label="Remover imagem de referência"
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface text-text-tertiary hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <UsageBadge remaining={creativesRemaining} limit={creativesLimit} className="mt-1 w-full max-w-none" />
            </div>

            <ReferenceImagePanel
              contextUrls={referenceContextUrls}
              onAdd={addToReferenceContext}
              onRemove={removeFromReferenceContext}
            />
            </div>
          </div>
        )}

        {/* LOADING VIEW */}
        {view === 'loading' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-5 text-center">
            <div className="rounded-full bg-brand/10 p-5">
              <Loader2 className="h-10 w-10 animate-spin text-brand" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
                {progressMessage || 'O ady está criando sua imagem...'}
                {elapsedSeconds > 0 && <span> ({elapsedSeconds}s)</span>}
              </h2>
              <p className="mt-2 text-sm text-text-tertiary">
                A geração com IA e a renderização podem levar de 1 a 2 minutos
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-xs text-text-tertiary">
              <span><span className="text-warning">✦</span> Aprimorando a explicação detalhada com o contexto da marca</span>
              <span><span className="text-warning">✦</span> Gerando imagem com IA</span>
              <span><span className="text-warning">✦</span> Salvando na biblioteca</span>
            </div>
          </div>
        )}

        {/* RESULT VIEW */}
        {view === 'result' && generationResult && (
          <>
            <div className="pt-1">
              <p className="text-sm text-text-tertiary">Regenere com ajustes, salve ou publique direto na sua conta</p>
            </div>
            <CreativeResult
              result={generationResult}
              onBack={handleBackToLibrary}
              onNewCreative={handleStartQuickCreate}
              onPublish={() => {
                setPreSelectedAsset({ id: generationResult.assetId, url: generationResult.imageUrl });
                navigate('/criar-campanha');
              }}
            />
          </>
        )}

        {/* ERROR VIEW */}
        {view === 'error' && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-5 text-center">
            <div className="rounded-full bg-warning/10 p-5">
              <AlertCircle className="h-10 w-10 text-warning" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
                Não foi possível gerar o anúncio
              </h2>
              <p className="mt-2 text-sm text-text-tertiary">
                {quotaErrorMessage ?? 'Verifique sua conexão e tente novamente'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleStartQuickCreate}
                className={`rounded-full bg-brand-hover px-5 py-2 text-sm font-semibold text-white ${BUTTON_HOVER}`}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={handleBackToLibrary}
                className={`rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary ${BUTTON_HOVER} hover:bg-surface-hover`}
              >
                Voltar para Biblioteca
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmArchiveAsset && (
        <ArchiveConfirmDialog
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmArchiveAsset.id)}
          onClose={() => setConfirmArchiveAsset(null)}
        />
      )}

      {showArchivedModal && (
        <ArchivedAssetsModal
          onClose={() => setShowArchivedModal(false)}
          onViewDetails={(asset) => {
            setShowArchivedModal(false);
            handleViewDetails(asset);
          }}
        />
      )}

      <Dialog open={showUploadBLimitAlert} onOpenChange={setShowUploadBLimitAlert}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Máximo de 2 fotos por vez</DialogTitle>
            <DialogDescription>
              Esse botão aceita no máximo 2 fotos de cada vez. Selecione até 2 fotos e envie novamente ou use o
              painel lateral, que aceita quantas fotos você quiser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowUploadBLimitAlert(false)}
              className="px-5 py-2.5 rounded-xl bg-brand-hover hover:opacity-90 text-white text-sm font-medium transition-colors"
            >
              Entendi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

interface AssetCardProps {
  asset: StudioAsset;
  onViewDetails: () => void;
  /** Card em modo arquivado: sem excluir, "Usar em campanha" vira "Restaurar anúncio". */
  archived?: boolean;
  onDeleteRequest?: () => void;
  onUseInCampaign?: () => void;
  onRestore?: () => void;
  restorePending?: boolean;
}

const BACKEND_URL = api.defaults.baseURL?.replace(/\/api$/, '') ?? '';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // data URLs (render-creative) e http são usados direto; o resto é caminho estático do backend.
  return url.startsWith('data:') || url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
}

export function AssetCard({ asset, onViewDetails, archived, onDeleteRequest, onUseInCampaign, onRestore, restorePending }: AssetCardProps) {
  const imageUrl = resolveAssetUrl(asset.url);
  const badge = complianceBadge(asset.complianceStatus, asset.complianceNotes);
  return (
    <div className={`group ${SURFACE} ${CARD_HOVER} overflow-hidden`}>
      {imageUrl && asset.type === 'image' ? (
        <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
          <img
            src={imageUrl}
            alt={asset.name}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {badge.tone === 'approved' && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-green-600/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm cursor-help">
                    <CheckCircle2 className="h-3 w-3" />
                    {badge.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 bg-green-700 text-white border-green-700">
                  {badge.hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {badge.tone === 'rejected' && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-red-600/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm cursor-help">
                    <AlertCircle className="h-3 w-3" />
                    {badge.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 bg-red-700 text-white border-red-700">
                  {badge.hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {badge.reasons.length > 0 && (
                <div className="absolute inset-x-0 bottom-0 space-y-1 bg-black/75 px-3 py-2 backdrop-blur-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-300">Motivo da reprovação</p>
                  <ul className="space-y-0.5">
                    {badge.reasons.slice(0, 2).map((reason, i) => (
                      <li key={i} className="line-clamp-2 text-[11px] leading-snug text-white/90">
                        • {reason}
                      </li>
                    ))}
                    {badge.reasons.length > 2 && (
                      <li className="text-[11px] text-white/70">+{badge.reasons.length - 2} motivo(s) — Ver detalhes</li>
                    )}
                  </ul>
                </div>
              )}
          {badge.tone === 'pending' && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-amber-500/95 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm cursor-help">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {badge.label}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 bg-amber-600 text-white border-amber-600">
                  {badge.hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-brand/10 to-background">
          <Sparkles className="h-10 w-10 text-brand/50 transition-transform duration-300 group-hover:scale-110" />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm font-semibold text-text-primary transition-colors group-hover:text-text-primary">
            {asset.name ?? `Anúncio de ${asset.type === 'image' ? 'imagem' : asset.type}`}
          </h3>
          {!archived && (
            <button
              type="button"
              onClick={onDeleteRequest}
              className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-destructive"
              title="Excluir anúncio"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {archived ? (
            <button
              type="button"
              onClick={onRestore}
              disabled={restorePending}
              className="flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:bg-brand hover:text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {restorePending ? 'Restaurando...' : 'Restaurar anúncio'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onUseInCampaign}
              className="flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:bg-brand hover:text-white hover:scale-[1.02] active:scale-[0.98]"
            >
              Usar em campanha
            </button>
          )}
          <button
            type="button"
            onClick={onViewDetails}
            className="flex-1 rounded-full bg-brand-hover px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand-hover/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            Ver detalhes
          </button>
        </div>
      </div>
    </div>
  );
}