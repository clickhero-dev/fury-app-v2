import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Image as ImageIcon, Info, Loader2, Plus, RectangleVertical, Send, Sparkles, Square, Trash2, Upload, Wand2, X } from 'lucide-react';
import { AppLayout, Card, CardContent, LoadingSpinner, PageHeader } from '@/components';
import { useCampaignWizardContext } from '@/contexts/CampaignWizardContext';
import { ModelSelect, type StudioModelOption } from '@/components/studio/ModelSelect';
import { UsageBadge } from '@/components/UsageBadge';
import type { LibraryPhoto } from '@/hooks/useStudioLibrary';
import api from '@/lib/api';
import { complianceBadge } from '@/lib/compliance.utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { StudioAsset, GenerateCreativeResponse } from '@/types/studio';
import { CreativeResult } from './components/CreativeResult';
import { ArchiveConfirmDialog } from './components/ArchiveConfirmDialog';
import { ArchivedAssetsModal } from './components/ArchivedAssetsModal';
import { ReferenceImagePanel } from './components/ReferenceImagePanel';
import { LibraryUploadFlow, type UploadRequest } from './components/LibraryUploadFlow';
import { LibraryPickerDialog, type PickerMode } from './components/LibraryPickerDialog';

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

const CHIP_ON = 'bg-brand text-white font-semibold shadow-sm';
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
  const [templatePhoto, setTemplatePhoto] = useState<LibraryPhoto | null>(null);
  const [artPhotos, setArtPhotos] = useState<LibraryPhoto[]>([]);
  const [uploadRequest, setUploadRequest] = useState<UploadRequest | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
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
    mutationFn: async (payload: {
      model: string;
      prompt: string;
      aspect_ratio: '1:1' | '9:16';
      template_photo_id?: string;
      photo_ids?: string[];
    }) => {
      if (!payload.template_photo_id) setProgressMessage('Gerando imagem...');
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
    setTemplatePhoto(null);
    setArtPhotos([]);
    setView('quick-create');
  };

  // Deep-link do FAB "Criar imagem": /estudio?criar=rapida abre a Criação
  // rápida direto (mesmo comportamento do botão da biblioteca). Mesmo padrão
  // do CalendarView ("adjusting state when a prop changes"): compara o valor
  // anterior do param durante o render e dispara o setState direto — cobre
  // tanto o mount (FAB a partir de outra rota) quanto a transição na mesma
  // rota (usuário já estava em /estudio; initializer do useState não roda).
  const [searchParams, setSearchParams] = useSearchParams();
  const criarParam = searchParams.get('criar');
  const [prevCriarParam, setPrevCriarParam] = useState<string | null>(null);
  if (criarParam !== prevCriarParam) {
    setPrevCriarParam(criarParam);
    if (criarParam === 'rapida') {
      handleStartQuickCreate();
    }
  }

  // O parâmetro sai da URL em seguida (replace) para não reabrir em navegações
  // futuras — remoção em efeito (setSearchParams não é setState local).
  useEffect(() => {
    if (criarParam === 'rapida') {
      const next = new URLSearchParams(searchParams);
      next.delete('criar');
      setSearchParams(next, { replace: true });
    }
  }, [criarParam, searchParams, setSearchParams]);

  // Fotos na arte: no máximo 2; nova escolha substitui a mais antiga
  const MAX_ART_PHOTOS = 2;
  const addArtPhotos = (photos: LibraryPhoto[]) => {
    setArtPhotos((prev) => {
      const combined = [...prev.filter((p) => !photos.some((n) => n.id === p.id)), ...photos];
      if (combined.length > MAX_ART_PHOTOS) {
        setToast({ message: 'Limite de 2 fotos na arte — a mais antiga foi substituída.', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
      return combined.slice(-MAX_ART_PHOTOS);
    });
  };

  const toggleArtPhoto = (photo: LibraryPhoto) => {
    if (artPhotos.some((p) => p.id === photo.id)) {
      setArtPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } else {
      addArtPhotos([photo]);
    }
  };

  const toggleTemplate = (photo: LibraryPhoto) => {
    setTemplatePhoto((prev) => (prev?.id === photo.id ? null : photo));
  };

  const requestTemplateUpload = (files: File[]) => {
    setUploadRequest({ kinds: ['modelo'], max: 1, files, onDone: (photos) => setTemplatePhoto(photos[0] ?? null) });
  };

  const requestArtUpload = () => {
    setUploadRequest({ kinds: ['produto', 'equipe'], max: MAX_ART_PHOTOS, onDone: addArtPhotos });
  };

  const handleQuickCreate = async () => {
    const finalPrompt = orPrompt.trim();
    if (finalPrompt.length < 10) return;
    setView('loading');
    // cronômetro começa no clique — cobre enhance-prompt + geração
    setGenerationStartedAt(Date.now());
    const photo_ids = artPhotos.length ? artPhotos.map((p) => p.id) : undefined;

    // com modelo: o texto é "o que muda" — vai direto, sem aprimorar
    if (templatePhoto) {
      setProgressMessage('Analisando o modelo e trocando os textos...');
      orImageMutation.mutate({
        model: selectedImageModel,
        prompt: finalPrompt,
        aspect_ratio: orAspectRatio,
        template_photo_id: templatePhoto.id,
        photo_ids,
      });
      return;
    }

    setProgressMessage('Aprimorando explicação detalhada...');
    try {
      const enhanceRes = await api.post('/studio/ai/enhance-prompt', {
        prompt: finalPrompt,
        type: CREATIVE_TYPE,
        // com fotos, o aprimoramento monta a cena em volta delas
        photo_kinds: artPhotos.length ? artPhotos.map((p) => p.kind) : undefined,
      });
      const { enhancedPrompt } = enhanceRes.data as { enhancedPrompt: string };
      orImageMutation.mutate({ model: selectedImageModel, prompt: enhancedPrompt, aspect_ratio: orAspectRatio, photo_ids });
    } catch {
      orImageMutation.mutate({ model: selectedImageModel, prompt: finalPrompt, aspect_ratio: orAspectRatio, photo_ids });
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
                    className={`ady-btn quick-create-btn inline-flex items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-2.5 text-sm font-semibold text-white shadow-md ${BUTTON_HOVER} hover:bg-brand-hover/90 disabled:opacity-50`}
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

                {/* Filtro de status de compliance desativado
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
                */}

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
                <div className="ady-decor flex flex-wrap items-center gap-2">
                  <label htmlFor="quick-create-prompt" className="block text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                    {templatePhoto ? 'O que muda no modelo?' : 'Descreva o anúncio'}
                  </label>
                  {templatePhoto && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">Modelo anexado</span>
                  )}
                </div>
                <textarea
                  id="quick-create-prompt"
                  value={orPrompt}
                  maxLength={1000}
                  onChange={(e) => setOrPrompt(e.target.value)}
                  placeholder={
                    templatePhoto
                      ? 'Diga o que trocar. Ex: Empresa DUO Oral Care, vaga de Consultor(a) em Joinville-SC, fixo de R$ 3.000 + comissões...'
                      : 'Ex: Anúncio fashion minimalista com luz natural, modelo feminina, fundo branco, cores suaves...'
                  }
                  className="min-h-36 w-full resize-none rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-text-primary placeholder:text-text-disabled outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <div className="flex items-center justify-between gap-3 text-xs text-text-tertiary">
                  <span>{orPrompt.trim().length}/1000</span>
                  <span>
                    {templatePhoto
                      ? 'Com modelo, é só dizer o que trocar. O resto fica igual.'
                      : 'Imagem • explicação detalhada = melhor resultado'}
                  </span>
                </div>

                {/* Imagens: modelo (copia o estilo) e fotos na arte (aparecem no anúncio) */}
                <div className="ady-decor space-y-2.5 border-t border-border pt-4">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">Quer usar imagens?</h3>
                    <span className="text-xs text-text-tertiary">Opcional</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className={`rounded-xl border p-4 ${templatePhoto ? 'border-2 border-brand' : 'border-border'}`}>
                      {templatePhoto ? (
                        <div className="flex gap-3">
                          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border">
                            <img src={templatePhoto.url} alt="" className="h-full w-full object-cover" />
                            <span className="absolute bottom-1 left-1 rounded-full bg-brand-hover px-1.5 py-px text-[9px] font-bold text-white">Modelo</span>
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-sm font-semibold text-text-primary">Modelo escolhido</p>
                            <p className="text-xs leading-relaxed text-text-secondary">
                              Vamos seguir o layout, as cores e o estilo deste anúncio e trocar só os textos.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPickerMode('modelo')}
                                className="ady-btn rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-primary"
                              >
                                Trocar
                              </button>
                              <button
                                type="button"
                                onClick={() => setTemplatePhoto(null)}
                                className="ady-btn rounded-full px-2 py-1.5 text-xs font-semibold text-destructive"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-text-primary">Usar um anúncio como modelo</p>
                            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">1 imagem</span>
                          </div>
                          <p className="text-xs leading-relaxed text-text-secondary">
                            Gostou de um anúncio? A gente analisa e cria um parecido, com os seus textos.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPickerMode('modelo')}
                              className="ady-btn rounded-full bg-brand-hover px-3.5 py-2 text-xs font-semibold text-white"
                            >
                              Meus modelos
                            </button>
                            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-brand/50 bg-brand/5 px-3.5 py-2 text-xs font-semibold text-brand hover:bg-brand/10">
                              <input
                                type="file"
                                accept="image/png,image/jpeg"
                                className="sr-only"
                                aria-label="Enviar modelo"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files ?? []);
                                  e.target.value = '';
                                  if (files.length) requestTemplateUpload(files);
                                }}
                              />
                              <Upload className="h-3.5 w-3.5" />
                              Enviar modelo
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={`rounded-xl border p-4 ${artPhotos.length ? 'border-2 border-amber-600' : 'border-border'}`}>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {artPhotos.length ? 'Fotos na arte' : 'Colocar foto na arte'}
                          </p>
                          <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                            {artPhotos.length ? `${artPhotos.length} de ${MAX_ART_PHOTOS}` : `até ${MAX_ART_PHOTOS} fotos`}
                          </span>
                        </div>
                        {artPhotos.length ? (
                          <div className="flex flex-wrap gap-2">
                            {artPhotos.map((photo) => (
                              <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                                <img src={photo.url} alt="" className="h-full w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => toggleArtPhoto(photo)}
                                  aria-label="Remover foto da arte"
                                  className="ady-btn absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-tertiary hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            {artPhotos.length < MAX_ART_PHOTOS && (
                              <button
                                type="button"
                                onClick={() => setPickerMode('arte')}
                                className="ady-btn flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-amber-600/60 text-xs font-semibold text-amber-700"
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            <p className="text-xs leading-relaxed text-text-secondary">
                              Seu produto, você ou sua equipe aparecendo dentro do anúncio.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPickerMode('arte')}
                                className="ady-btn rounded-full bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white"
                              >
                                Minhas fotos
                              </button>
                              <button
                                type="button"
                                onClick={requestArtUpload}
                                className="ady-btn inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-600/60 bg-amber-500/5 px-3.5 py-2 text-xs font-semibold text-amber-700"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                Enviar foto
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {templatePhoto && (
                    <p className="text-xs text-text-tertiary">Use artes suas ou que você tenha direito de usar.</p>
                  )}
                </div>

                <div className="ady-decor flex flex-wrap items-center gap-2.5 border-t border-border pt-4">
                  {templatePhoto ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                      <Info className="h-3.5 w-3.5" />
                      IA escolhida automaticamente para seguir o modelo
                    </span>
                  ) : (
                    <ModelSelect
                      models={imageModels}
                      selectedModel={selectedImageModel}
                      onSelect={setSelectedImageModel}
                      id="quick-create-model-select"
                      compact
                    />
                  )}

                  <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1">
                    <button
                      type="button"
                      onClick={() => setOrAspectRatio('1:1')}
                      aria-pressed={orAspectRatio === '1:1'}
                      className={`ady-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${orAspectRatio === '1:1' ? CHIP_ON : CHIP_OFF}`}
                    >
                      <Square className="h-3.5 w-3.5" />
                      Quadrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrAspectRatio('9:16')}
                      aria-pressed={orAspectRatio === '9:16'}
                      className={`ady-btn flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${orAspectRatio === '9:16' ? CHIP_ON : CHIP_OFF}`}
                    >
                      <RectangleVertical className="h-3.5 w-3.5" />
                      Vertical
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleQuickCreate}
                    disabled={orPrompt.trim().length < 10 || orImageMutation.isPending || quotaReached}
                    className={`ady-btn ml-auto inline-flex items-center justify-center gap-2 rounded-full bg-brand-hover px-5 py-2.5 text-sm font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50`}
                  >
                    {orImageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Gerar imagem
                  </button>
                </div>
              </CardContent>
            </Card>
            <UsageBadge remaining={creativesRemaining} limit={creativesLimit} className="mt-1 w-full max-w-none" />
            </div>

            <ReferenceImagePanel
              templateId={templatePhoto?.id ?? null}
              artPhotoIds={artPhotos.map((p) => p.id)}
              onPickTemplate={toggleTemplate}
              onToggleArtPhoto={toggleArtPhoto}
              onUploadClick={() => setUploadRequest({ kinds: ['modelo', 'produto', 'equipe'], max: null })}
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
              {templatePhoto ? (
                <>
                  <span><span className="text-warning">✦</span> Analisando o layout do modelo</span>
                  <span><span className="text-warning">✦</span> Trocando os textos pelos seus</span>
                </>
              ) : (
                <>
                  <span><span className="text-warning">✦</span> Aprimorando a explicação detalhada com o contexto da marca</span>
                  <span><span className="text-warning">✦</span> Gerando imagem com IA</span>
                </>
              )}
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
                className={`ady-btn rounded-full bg-brand-hover px-5 py-2 text-sm font-semibold text-white ${BUTTON_HOVER}`}
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

      <LibraryUploadFlow request={uploadRequest} onClose={() => setUploadRequest(null)} />
      <LibraryPickerDialog
        mode={pickerMode}
        selectedIds={pickerMode === 'modelo' ? (templatePhoto ? [templatePhoto.id] : []) : artPhotos.map((p) => p.id)}
        maxArt={MAX_ART_PHOTOS}
        onClose={() => setPickerMode(null)}
        onConfirm={(photos) => {
          if (pickerMode === 'modelo') setTemplatePhoto(photos[0] ?? null);
          else setArtPhotos(photos.slice(0, MAX_ART_PHOTOS));
          setPickerMode(null);
        }}
        onUploadFiles={(files) => {
          setPickerMode(null);
          requestTemplateUpload(files);
        }}
        onUploadClick={() => {
          setPickerMode(null);
          requestArtUpload();
        }}
      />
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
              className="ady-btn flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:bg-brand hover:text-white hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {restorePending ? 'Restaurando...' : 'Restaurar anúncio'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onUseInCampaign}
              className="ady-btn flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:bg-brand hover:text-white hover:scale-[1.02] active:scale-[0.98]"
            >
              Usar em campanha
            </button>
          )}
          <button
            type="button"
            onClick={onViewDetails}
            className="ady-btn flex-1 rounded-full bg-brand-hover px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand-hover/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            Ver detalhes
          </button>
        </div>
      </div>
    </div>
  );
}