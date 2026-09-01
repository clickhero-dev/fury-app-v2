import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, ArrowRight, Image as ImageIcon, Loader2, Send, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { AppLayout, Card, CardContent, LoadingSpinner, PageHeader } from '@/components';
import { CampaignWizard } from '@/components/campaign-wizard/CampaignWizard';
import api from '@/lib/api';
import type { StudioAsset } from '@/types/studio';
import { CreativeResult } from './components/CreativeResult';

type ViewState = 'library' | 'loading' | 'result' | 'error' | 'quick-create';

const FEATURES = {
  videoAnuncios: false,
};

const CREATIVE_TYPE = 'image' as const;
const IMAGE_MODEL = 'black-forest-labs/flux.2-max';

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
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>('library');
  const [generationResult, setGenerationResult] = useState<any>(null);
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
    } catch { /* fallback */ }
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
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
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
                    className={`quick-create-btn inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground shadow-md ${BUTTON_HOVER} hover:bg-brand/90 disabled:opacity-50`}
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    Criação rápida
                  </button>

                  {/* Informação do número de criativos dinâmica */}
                  {creativesRemaining !== null && (
                    <p className="text-xs text-text-tertiary">
                      {quotaReached
                        ? 'Limite de criativos do mês atingido — faça upgrade do plano para continuar'
                        : `${creativesRemaining}${creativesLimit !== null ? ` de ${creativesLimit}` : ''} criativo${creativesRemaining !== 1 ? 's' : ''} restante${creativesRemaining !== 1 ? 's' : ''} este mês`}
                    </p>
                  )}
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
            </section>
          </>
        )}

        {/* QUICK CREATE VIEW */}
        {view === 'quick-create' && (
          <div className="mx-auto w-full max-w-2xl space-y-5">
            <p className="text-sm text-text-tertiary">
              Descreva o anúncio que deseja gerar para criar a imagem ideal
            </p>

            {quotaReached && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Limite de criativos do mês atingido — faça upgrade do plano para continuar.
              </div>
            )}

            <Card className={`${SURFACE} border-0 bg-transparent shadow-none`}>
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
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleQuickCreate}
                    disabled={orPrompt.trim().length < 10 || orImageMutation.isPending || quotaReached}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand py-2.5 text-sm font-semibold text-brand-foreground ${BUTTON_HOVER} disabled:opacity-50`}
                  >
                    {orImageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Gerar imagem
                  </button>
                  {creativesRemaining !== null && (
                    <p className="text-center text-xs text-text-tertiary">
                      {creativesRemaining}{creativesLimit !== null ? ` de ${creativesLimit}` : ''} criativo{creativesRemaining !== 1 ? 's' : ''} restante{creativesRemaining !== 1 ? 's' : ''} este mês
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
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
                setWizardAsset({ id: generationResult.assetId, url: generationResult.imageUrl });
                setWizardOpen(true);
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
                className={`rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-foreground ${BUTTON_HOVER}`}
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

const BACKEND_URL = api.defaults.baseURL?.replace(/\/api$/, '') ?? '';

function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
}

function AssetCard({ asset, isDeleting, deletePending, onDeleteRequest, onDeleteConfirm, onDeleteCancel, onViewDetails, onUseInCampaign }: AssetCardProps) {
  const imageUrl = resolveAssetUrl(asset.url);
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
          <button
            type="button"
            onClick={onDeleteRequest}
            className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-destructive"
            title="Excluir anúncio"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {isDeleting ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-destructive">Excluir este anúncio?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={deletePending}
                className="flex-1 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-all hover:opacity-90 disabled:opacity-50"
              >
                {deletePending ? 'Excluindo...' : 'Confirmar'}
              </button>
              <button
                type="button"
                onClick={onDeleteCancel}
                className="flex-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition-all hover:bg-surface-hover"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onUseInCampaign}
              className="flex-1 rounded-full border border-brand px-3 py-1.5 text-xs font-semibold text-brand transition-all duration-200 hover:bg-brand hover:text-white hover:scale-[1.02] active:scale-[0.98]"
            >
              Usar em campanha
            </button>
            <button
              type="button"
              onClick={onViewDetails}
              className="flex-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-brand/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              Ver detalhes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}