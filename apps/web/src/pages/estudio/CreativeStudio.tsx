import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Copy, Loader2, Sparkles, Upload, Wand2 } from 'lucide-react';
import { AppLayout, Button, Card, CardContent, PageHeader, StatusBadge } from '@/components';
import api from '@/lib/api';
import type {
  StudioComplianceStatusResponse,
  StudioPublishResponse,
  StudioTemplate,
} from '@/types/studio';

interface ModelInfo {
  id: string;
  label: string;
  description: string;
  category: string;
  type: 'image' | 'video';
}

const TEMPLATES: StudioTemplate[] = [
  {
    id: 'fashion',
    label: 'Moda & Beleza',
    niche: 'fashion',
    prompt: 'Anúncio para coleção premium de moda feminina, luz natural, styling editorial, fundo minimalista e estética aspiracional.',
  },
  {
    id: 'ecommerce',
    label: 'E-commerce',
    niche: 'ecommerce',
    prompt: 'Criativo para loja online de produto em destaque, composição limpa, foco no benefício principal e call-to-action visual.',
  },
  {
    id: 'saas',
    label: 'SaaS',
    niche: 'saas',
    prompt: 'Imagem de anúncio para software B2B, visual moderno, interface fluida, confiança e sensação de produtividade.',
  },
  {
    id: 'food',
    label: 'Food & Delivery',
    niche: 'food',
    prompt: 'Peça publicitária para delivery gourmet com imagem apetitoso, contraste forte, cores quentes e apelo imediato.',
  },
  {
    id: 'real-estate',
    label: 'Imobiliário',
    niche: 'real-estate',
    prompt: 'Anúncio imobiliário com fachada elegante, luz de fim de tarde, sensação de exclusividade e alto padrão.',
  },
];

function getComplianceTone(status?: StudioComplianceStatusResponse['complianceStatus']) {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending_compliance';
}

function categoryBadge(category: string) {
  if (category === 'barato') return { label: '💰 Barato', class: 'bg-green-100 text-green-700' };
  if (category === 'custo-beneficio') return { label: '⭐ Custo-benefício', class: 'bg-blue-100 text-blue-700' };
  return { label: '👑 Qualidade', class: 'bg-purple-100 text-purple-700' };
}

export function CreativeStudio() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(TEMPLATES[0]?.prompt ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState(TEMPLATES[0]?.id ?? 'fashion');
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [publishFeedback, setPublishFeedback] = useState<{ hash: string; imageUrl: string; adsManagerUrl: string } | null>(null);

  // ─── OpenRouter state ──────────────────────────────────────
  const [creativeType, setCreativeType] = useState<'image' | 'video'>('image');
  const [selectedImageModel, setSelectedImageModel] = useState('black-forest-labs/flux.2-klein-4b');
  const [selectedVideoModel, setSelectedVideoModel] = useState('google/veo-3.1-lite');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: ['openrouter', 'models'],
    queryFn: async () => {
      const res = await api.get('/openrouter/models');
      return res.data as { image: ModelInfo[]; video: ModelInfo[] };
    },
    staleTime: 1000 * 60 * 60, // 1h
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const activeTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === selectedTemplateId) ?? TEMPLATES[0],
    [selectedTemplateId]
  );

  const generateImageMutation = useMutation({
    mutationFn: async (payload: { model: string; prompt: string; aspect_ratio?: string }) => {
      const response = await api.post('/openrouter/generate-image', payload);
      return response.data;
    },
    onSuccess: (data: any) => {
      setCurrentAssetId(data.creativeAssetId);
      setPollStartedAt(Date.now());
      setPublishFeedback(null);
      setGeneratedUrl(data.imageUrl);
      queryClient.setQueryData(['studio', 'asset', data.creativeAssetId], data);
    },
  });

  const generateVideoMutation = useMutation({
    mutationFn: async (payload: { model: string; prompt: string; duration?: number }) => {
      const response = await api.post('/openrouter/generate-video', payload);
      return response.data;
    },
    onSuccess: (data: any) => {
      setCurrentAssetId(data.creativeAssetId);
      setPublishFeedback(null);
      setGeneratedUrl(data.videoUrl);
    },
  });

  const complianceQuery = useQuery<StudioComplianceStatusResponse>({
    queryKey: ['studio', 'compliance', currentAssetId],
    queryFn: async () => {
      const response = await api.get<StudioComplianceStatusResponse>(`/studio/assets/${currentAssetId}/compliance-status`);
      return response.data;
    },
    enabled: Boolean(currentAssetId),
    refetchInterval: (query) => {
      if (!currentAssetId || !pollStartedAt) return false;
      if (Date.now() - pollStartedAt >= 30_000) return false;
      if (query.state.data?.complianceStatus && query.state.data.complianceStatus !== 'pending_compliance') {
        return false;
      }
      return 2000;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!currentAssetId) {
        throw new Error('Asset nao encontrado.');
      }

      const response = await api.post<StudioPublishResponse>(`/studio/publish/${currentAssetId}`, {});
      return response.data;
    },
    onSuccess: (data) => {
      setPublishFeedback({ hash: data.hash, imageUrl: data.imageUrl, adsManagerUrl: data.adsManagerUrl });
      if (currentAssetId) {
        void queryClient.invalidateQueries({ queryKey: ['studio', 'compliance', currentAssetId] });
      }
    },
  });

  const currentCompliance = complianceQuery.data;
  const complianceStatus = getComplianceTone(currentCompliance?.complianceStatus);
  const isPollingActive = Boolean(currentAssetId && pollStartedAt && !currentCompliance);
  const isWithinPollingWindow = Boolean(pollStartedAt && nowMs - pollStartedAt < 30_000);
  const canPublish = currentCompliance?.complianceStatus === 'approved';

  const isGenerating = generateImageMutation.isPending || generateVideoMutation.isPending;

  const handleGenerate = () => {
    const finalPrompt = prompt.trim();
    if (finalPrompt.length < 10) return;

    if (creativeType === 'image') {
      generateImageMutation.mutate({ model: selectedImageModel, prompt: finalPrompt });
    } else {
      generateVideoMutation.mutate({ model: selectedVideoModel, prompt: finalPrompt, duration: 4 });
    }
  };

  const handleRegenerate = () => {
    setPublishFeedback(null);
    const basePrompt = prompt.trim();
    const hasIssues = currentCompliance?.complianceStatus === 'rejected' && currentCompliance.issues.length > 0;

    if (!hasIssues) {
      handleGenerate();
      return;
    }

    const adjustmentHint = `\n\nAjustes obrigatorios de compliance Meta:\n- ${currentCompliance.issues.join('\n- ')}\n\nRegere mantendo o conceito principal, removendo qualquer violacao e reduzindo texto para menos de 20%.`;
    const adjustedPrompt = `${basePrompt}${adjustmentHint}`.slice(0, 1000);
    setPrompt(adjustedPrompt);
    if (creativeType === 'image') {
      generateImageMutation.mutate({ model: selectedImageModel, prompt: adjustedPrompt });
    } else {
      generateVideoMutation.mutate({ model: selectedVideoModel, prompt: adjustedPrompt });
    }
  };

  const handlePublish = async () => {
    if (!canPublish) return;

    const confirmed = window.confirm('Publicar este asset no Meta?');
    if (!confirmed) return;

    publishMutation.mutate();
  };

  const currentModels = creativeType === 'image'
    ? (modelsQuery.data?.image ?? [])
    : (modelsQuery.data?.video ?? []);

  const selectedModel = creativeType === 'image' ? selectedImageModel : selectedVideoModel;
  const setSelectedModel = creativeType === 'image' ? setSelectedImageModel : setSelectedVideoModel;

  return (
    <AppLayout header={<div className="flex items-center justify-between" />}>
      <div className="space-y-8 bg-[radial-gradient(circle_at_top_right,_rgba(232,99,26,0.08),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(0,0,0,0.04),_transparent_25%)]">
        <PageHeader
          title="Creative Studio"
          description="FURY gera criativos com IA via OpenRouter — escolha entre 3 modelos de imagem e 3 de vídeo."
          actions={<StatusBadge status={complianceStatus} />}
        />

        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
          <Card className="overflow-hidden border-[#E6E8EC] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="space-y-6">
              {/* Seletor de tipo de criativo */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8631A]">Tipo de criativo</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCreativeType('image')}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                      creativeType === 'image'
                        ? 'border-[#E8631A] bg-[#FFF4ED] text-[#E8631A]'
                        : 'border-[#E6E8EC] bg-white text-[#667085]'
                    }`}
                  >
                    🖼️ Imagem
                  </button>
                  <button
                    onClick={() => setCreativeType('video')}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                      creativeType === 'video'
                        ? 'border-[#E8631A] bg-[#FFF4ED] text-[#E8631A]'
                        : 'border-[#E6E8EC] bg-white text-[#667085]'
                    }`}
                  >
                    🎬 Vídeo
                  </button>
                </div>
              </div>

              {/* Seletor de modelo */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8631A]">
                  Modelo de {creativeType === 'image' ? 'imagem' : 'vídeo'}
                </p>
                <div className="space-y-2">
                  {currentModels.length > 0 ? (
                    currentModels.map((model) => {
                      const badge = categoryBadge(model.category);
                      return (
                        <button
                          key={model.id}
                          onClick={() => setSelectedModel(model.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                            selectedModel === model.id
                              ? 'border-[#E8631A] bg-[#FFF4ED]'
                              : 'border-[#E6E8EC] bg-white hover:border-[#F0B48E]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-[#101828]">{model.label}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.class}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-[#667085]">{model.description}</p>
                        </button>
                      );
                    })
                  ) : (
                    <div className="space-y-2">
                      {/* Fallback inline enquanto a query carrega */}
                      {[
                        { id: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5', desc: 'ByteDance — Mais barato ($0.04/img)', cat: 'barato' },
                        { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', desc: 'Black Forest Labs — Melhor custo-benefício', cat: 'custo-beneficio' },
                        { id: 'black-forest-labs/flux.2-max', label: 'FLUX.2 Max', desc: 'Black Forest Labs — Máxima qualidade', cat: 'qualidade' },
                      ].map((m) => {
                        const badge = categoryBadge(m.cat);
                        return (
                          <button
                            key={m.id}
                            onClick={() => setSelectedModel(m.id)}
                            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                              selectedModel === m.id
                                ? 'border-[#E8631A] bg-[#FFF4ED]'
                                : 'border-[#E6E8EC] bg-white hover:border-[#F0B48E]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-[#101828]">{m.label}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.class}`}>
                                {badge.label}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[#667085]">{m.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8631A]">Templates por nicho</p>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        setPrompt(template.prompt);
                      }}
                      className={`rounded-2xl border px-3 py-3 text-left transition-all ${selectedTemplateId === template.id
                        ? 'border-[#E8631A] bg-[#FFF4ED] shadow-sm'
                        : 'border-[#E6E8EC] bg-white hover:border-[#F0B48E]'
                        }`}
                    >
                      <div className="text-sm font-semibold text-[#101828]">{template.label}</div>
                      <div className="mt-1 text-xs text-[#667085]">{template.niche}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#101828]">Descreva seu anúncio</label>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Descreva o estilo, produto, cenário, ângulo e público..."
                  className="min-h-44 w-full rounded-2xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
                />
                <div className="flex items-center justify-between text-xs text-[#667085]">
                  <span>{prompt.trim().length}/1000</span>
                  <span>{activeTemplate?.label}</span>
                </div>
              </div>

              <div className="rounded-2xl bg-[#FFF7F2] p-4 text-sm text-[#7A4A27]">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-[#E8631A]" />
                  <p>Use um prompt específico com produto, cenário e objetivo. Quanto mais detalhado, melhor o resultado e a análise de compliance.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 bg-[#E8631A] hover:bg-[#D45714]"
                >
                  {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Gerar {creativeType === 'image' ? 'imagem' : 'vídeo'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (prompt && navigator.clipboard) {
                      void navigator.clipboard.writeText(prompt);
                    }
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar
                </Button>
              </div>

              {isGenerating && (
                <div className="rounded-2xl border border-[#FFE3D4] bg-[#FFF7F2] p-4 text-sm text-[#7A4A27]">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-[#E8631A]" />
                    <span>FURY está criando seu {creativeType === 'image' ? 'anúncio' : 'vídeo'}...</span>
                  </div>
                </div>
              )}

              {currentCompliance?.complianceStatus === 'rejected' && currentCompliance.issues.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    Issues detectadas
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-red-700">
                    {currentCompliance.issues.map((issue) => (
                      <li key={issue} className="flex items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-500" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-[#E6E8EC] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E8631A]">Preview</p>
                  <h2 className="text-2xl font-bold text-[#101828]">Criativo gerado</h2>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={complianceStatus} />
                  {isPollingActive && isWithinPollingWindow && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1 text-xs font-semibold text-[#B54708]">checando compliance...</span>
                  )}
                </div>
              </div>

              {!currentAssetId && !isGenerating && (
                <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[#E6E8EC] bg-[#FCFCFD] text-center">
                  <div className="rounded-full bg-[#FFF4ED] p-4 text-[#E8631A]">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-[#101828]">Pronto para gerar</h3>
                  <p className="mt-2 max-w-md text-sm text-[#667085]">Escolha um modelo, um template ou escreva um prompt detalhado. O preview, o status de compliance e a publicação aparecem aqui.</p>
                </div>
              )}

              {isGenerating && (
                <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-[#E6E8EC] bg-gradient-to-br from-[#FFF7F2] to-white">
                  <div className="space-y-4 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#E8631A]" />
                    <p className="text-base font-semibold text-[#101828]">FURY está criando seu {creativeType === 'image' ? 'anúncio' : 'vídeo'}...</p>
                    <p className="text-sm text-[#667085]">A geração via OpenRouter e a checagem de compliance são processadas em sequência.</p>
                  </div>
                </div>
              )}

              {currentAssetId && !isGenerating && !currentCompliance && (
                <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-[#E6E8EC] bg-gradient-to-br from-[#FFF7F2] to-white">
                  <div className="space-y-4 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#E8631A]" />
                    <p className="text-base font-semibold text-[#101828]">FURY está criando seu {creativeType === 'image' ? 'anúncio' : 'vídeo'}...</p>
                    <p className="text-sm text-[#667085]">
                      {isWithinPollingWindow ? 'Análise de compliance em andamento.' : 'A janela de polling terminou. Atualize ou gere novamente.'}
                    </p>
                  </div>
                </div>
              )}

              {currentAssetId && currentCompliance && !isGenerating && (
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-[28px] border border-[#E6E8EC] bg-[#101828]">
                    <div className="relative aspect-square md:aspect-[16/11]">
                      {creativeType === 'video' && generatedUrl ? (
                        <video
                          src={generatedUrl}
                          controls
                          className="h-full w-full object-cover"
                        />
                      ) : generatedUrl ? (
                        <img
                          src={generatedUrl}
                          alt="Preview do criativo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={currentCompliance.imageUrl}
                          alt="Preview do criativo"
                          className="h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                        <CheckCircle2 className="h-4 w-4" />
                        {currentCompliance.complianceStatus === 'approved' ? 'Aprovado' : currentCompliance.complianceStatus === 'rejected' ? 'Reprovado' : 'Em análise'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-[#FCFCFD] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Prompt</p>
                      <p className="mt-2 text-sm text-[#101828]">{prompt}</p>
                    </div>
                    <div className="rounded-2xl bg-[#FCFCFD] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Texto na imagem</p>
                      <p className="mt-2 text-sm text-[#101828]">
                        {currentCompliance.textPercentage == null ? 'Aguardando análise' : `${currentCompliance.textPercentage}%`}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[#FCFCFD] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">Gerado em</p>
                      <p className="mt-2 text-sm text-[#101828]">{new Date(currentCompliance.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  {currentCompliance.complianceStatus === 'rejected' && currentCompliance.issues.length > 0 && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                        <AlertCircle className="h-4 w-4" />
                        Por que o criativo foi reprovado
                      </div>
                      <ul className="mt-3 space-y-2 text-sm text-red-700">
                        {currentCompliance.issues.map((issue) => (
                          <li key={issue} className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-500" />
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {publishFeedback && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Publicado no Meta
                      </div>
                      <p className="mt-2 text-sm text-emerald-700">Hash: {publishFeedback.hash}</p>
                      <a
                        href={publishFeedback.adsManagerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 underline"
                      >
                        Abrir no Meta Ads Manager
                      </a>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleRegenerate} variant="outline" className="min-w-36">
                      <Wand2 className="mr-2 h-4 w-4" />
                      Regenerar com ajustes
                    </Button>
                    <Button
                      onClick={handlePublish}
                      disabled={!canPublish || publishMutation.isPending}
                      className="min-w-44 bg-[#E8631A] hover:bg-[#D45714]"
                    >
                      {publishMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Publicar no Meta
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
