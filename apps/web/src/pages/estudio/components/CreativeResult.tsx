import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookmarkCheck, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import { Button } from '@/components';
import api from '@/lib/api';
import { layoutLabel, isKnownLayout } from '@/lib/layout-labels';
import type { GenerateCreativeResponse, StudioPublishResponse } from '@/types/studio';

interface Props {
  result: GenerateCreativeResponse;
  onBack: () => void;
  onNewCreative: () => void;
  // ponytail: quando presente, "Publicar no Meta" abre o wizard (imagem presetada)
  // em vez de publicar direto — alinha com o botão "Usar em campanha".
  onPublish?: () => void;
}

// ponytail: gera máscara de inpainting a partir do canvas de pintura
function generateMaskBlob(source: HTMLCanvasElement): Blob | null {
  if (source.width === 0 || source.height === 0) return null;
  const SIZE = 256;
  const tiny = document.createElement('canvas');
  tiny.width = SIZE;
  tiny.height = SIZE;
  tiny.getContext('2d')!.drawImage(source, 0, 0, SIZE, SIZE);
  const mask = document.createElement('canvas');
  mask.width = SIZE;
  mask.height = SIZE;
  const ctx = mask.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(tiny, 0, 0);
  // ponytail: toBlob é async via callback — usamos Promise
  return new Promise((resolve) => mask.toBlob((b) => resolve(b), 'image/png')) as unknown as Blob | null;
}

export function CreativeResult({ result, onBack, onNewCreative, onPublish }: Props) {
  const queryClient = useQueryClient();
  const [currentResult, setCurrentResult] = useState(result);
  const [feedback, setFeedback] = useState('');
  const [publishFeedback, setPublishFeedback] = useState<StudioPublishResponse | null>(null);

  // ponytail: máscara canvas — pintura contínua (mousedown + drag)
  const [hasMask, setHasMask] = useState(false);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);

  // ponytail: pergunta pós-criação visível por padrão no quick-create
  const [showRegenerateForm, setShowRegenerateForm] = useState(!!currentResult.type);

  const isQuickCreate = !!currentResult.type;
  const isVideo = currentResult.type === 'video';
  const displayUrl = isVideo ? (currentResult.videoUrl ?? currentResult.imageUrl) : currentResult.imageUrl;

  const clearMask = useCallback(() => {
    const c = maskCanvasRef.current;
    if (c) {
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
    }
    setHasMask(false);
  }, []);

  // resync canvas size with container
  useEffect(() => {
    const c = maskCanvasRef.current;
    if (!c || !c.parentElement) return;
    const sync = () => {
      const rect = c.parentElement!.getBoundingClientRect();
      if (c.width !== rect.width || c.height !== rect.height) {
        c.width = rect.width;
        c.height = rect.height;
        clearMask();
      }
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [currentResult, clearMask]);

  const canvasEvents = isQuickCreate && !isVideo ? {
    onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      paintingRef.current = true;
      const c = maskCanvasRef.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    },
    onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!paintingRef.current) return;
      const c = maskCanvasRef.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.strokeStyle = 'rgba(232,99,26,1.0)';
      ctx.lineWidth = 40;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      setHasMask(true);
    },
    onPointerUp() {
      paintingRef.current = false;
    },
    onPointerLeave() {
      paintingRef.current = false;
    },
  } : {};

  const regenerateMutation = useMutation({
    mutationFn: async ({ assetId, feedbackText }: { assetId: string; feedbackText: string }) => {
      // ponytail: FormData multipart — mask vai como arquivo, não base64 no JSON
      const maskBlob = maskCanvasRef.current ? await generateMaskBlob(maskCanvasRef.current) : null;
      const fd = new FormData();
      fd.append('assetId', assetId);
      fd.append('feedback', feedbackText);
      if (maskBlob) fd.append('mask', maskBlob, 'mask.png');

      const endpoint = isQuickCreate ? '/openrouter/regenerate-ad' : '/studio/creative/regenerate';
      const res = await api.post<GenerateCreativeResponse>(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCurrentResult(data);
      setPublishFeedback(null);
      setShowRegenerateForm(true);
      setFeedback('');
      clearMask();
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await api.post<StudioPublishResponse>(`/studio/publish/${assetId}`, {});
      return res.data;
    },
    onSuccess: (data) => setPublishFeedback(data),
  });

  const handleSaveToLibrary = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    onBack();
  };

  const cd = currentResult.creativeData;
  const isLegacy = !!cd.layout && !isKnownLayout(cd.layout);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* Preview area — video or image */}
        <div className="overflow-hidden rounded-2xl border border-[#E6E8EC]">
          <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
            {isVideo && displayUrl ? (
              <video
                src={displayUrl}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover block rounded-lg"
                style={{ opacity: regenerateMutation.isPending ? 0.5 : 1, transition: 'opacity 0.2s' }}
                onError={(e) => {
                  console.error('=== Video failed to load:', displayUrl);
                  (e.target as HTMLVideoElement).style.display = 'none';
                }}
              />
            ) : (
              <>
                <img
                  src={displayUrl}
                  alt="Criativo gerado"
                  className="w-full h-full object-cover block rounded-lg"
                  style={{ opacity: regenerateMutation.isPending ? 0.5 : 1, transition: 'opacity 0.2s' }}
                  onError={(e) => {
                    console.error('=== Image failed to load:', displayUrl);
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {/* ponytail: canvas de pintura sobre a imagem */}
                {isQuickCreate && (
                  <canvas
                    ref={maskCanvasRef}
                    className="absolute inset-0 w-full h-full rounded-lg"
                    style={{ cursor: 'crosshair', touchAction: 'none', opacity: 0.15 }}
                    {...canvasEvents}
                  />
                )}
              </>
            )}
            {regenerateMutation.isPending && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 rounded-xl bg-black/60 px-5 py-4 text-sm text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Regenerando...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8631A]">
              {isVideo ? 'Seu vídeo' : 'Seu anúncio'}
            </p>
            {cd.layout && (
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#101828]">{layoutLabel(cd.layout)}</p>
                {isLegacy && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FEF3F2] text-[#B42318]">
                    Modelo descontinuado
                  </span>
                )}
              </div>
            )}
            <p className="text-sm text-[#667085]">
              {isLegacy ? 'Este modelo foi descontinuado. Crie um novo anúncio para usar os formatos atuais.' : isQuickCreate ? 'Criado via Criação Rápida. Regenere com ajustes ou salve na biblioteca.' : 'Pronto. Regenere com ajustes, salve ou publique no Meta.'}
            </p>
          </div>

          {(cd.headline || cd.offer_text || cd.qualifier) && (
            <div className="rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] p-4 space-y-2">
              {cd.qualifier && <Line label="Chamada" value={cd.qualifier} />}
              {cd.headline && <Line label="Título" value={cd.headline} />}
              {cd.offer_text && <Line label="Oferta" value={cd.offer_text} />}
              {cd.subheadline && <Line label="Apoio" value={cd.subheadline} />}
              {cd.subtitle && <Line label="Apoio" value={cd.subtitle} />}
              {cd.benefits && cd.benefits.length > 0 && <Line label="Benefícios" value={cd.benefits.join(' · ')} />}
              {cd.cta && <Line label="Botão" value={cd.cta} />}
            </div>
          )}

          {/* ponytail: pergunta pós-criação visível por padrão */}
          {showRegenerateForm && isQuickCreate && (
            <div className="space-y-2 rounded-xl border border-border bg-surface-secondary p-4">
              <p className="text-sm font-semibold text-text-primary">Deseja incluir mais alguma coisa no anúncio?</p>
              <p className="text-xs text-[#98A2B3]">Segure e arraste sobre a imagem para marcar a área. Depois descreva o ajuste abaixo.</p>
              {hasMask && (
                <button onClick={clearMask} className="flex items-center gap-1 text-xs text-[#E8631A] hover:underline">
                  <X className="h-3 w-3" /> Limpar marcação
                </button>
              )}
              <textarea
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex: Remover este texto, trocar cor de fundo, adicionar ícone..."
                rows={3}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => regenerateMutation.mutate({ assetId: currentResult.assetId, feedbackText: feedback })}
                  disabled={feedback.trim().length < 3 || regenerateMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#E8631A] hover:bg-[#D45714] text-white text-sm"
                >
                  {regenerateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Aplicar ajustes
                </Button>
                <Button variant="outline" onClick={() => setShowRegenerateForm(false)} className="flex items-center justify-center gap-2 text-sm">
                  Não, obrigado
                </Button>
              </div>
              {regenerateMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Erro ao regenerar. Tente novamente.
                </div>
              )}
            </div>
          )}

          {publishFeedback && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 space-y-1">
              <p className="font-semibold">Publicado no Meta!</p>
              <p className="text-xs">Hash: {publishFeedback.hash}</p>
              <a href={publishFeedback.adsManagerUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">
                Abrir no Ads Manager →
              </a>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {!isLegacy && !showRegenerateForm && (
              <Button variant="outline" size="sm" onClick={() => setShowRegenerateForm(true)} disabled={regenerateMutation.isPending} className="w-full flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 shrink-0" />
                Regenerar com ajuste
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleSaveToLibrary} className="w-full flex items-center justify-center gap-2">
              <BookmarkCheck className="h-4 w-4 shrink-0" />
              Salvar na Biblioteca
            </Button>
            <Button
              size="sm"
              onClick={() => (onPublish ? onPublish() : publishMutation.mutate(currentResult.assetId))}
              disabled={publishMutation.isPending || !!publishFeedback}
              className="w-full flex items-center justify-center gap-2 bg-[#E8631A] hover:bg-[#D45714] text-white"
            >
              {publishMutation.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Upload className="h-4 w-4 shrink-0" />}
              Publicar no Meta
            </Button>
            {publishMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Erro ao publicar. Verifique a conexão com o Meta.
              </div>
            )}
            <button onClick={onNewCreative} className="text-center text-xs text-[#667085] hover:text-[#E8631A] transition-colors pt-1">
              Criar outro anúncio →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-[#98A2B3] shrink-0 w-20">{label}</span>
      <span className="text-[#101828] font-medium">{value}</span>
    </div>
  );
}
