import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Clock, Loader2, RectangleHorizontal, RectangleVertical, RefreshCw, Sparkles, Upload, Video, X } from 'lucide-react';
import { UsageBadge } from '@/components/UsageBadge';
import { useCreateStudioVideo, useGenerateVideoScript, useStudioVideoOptions } from '@/hooks/useStudioVideo';
import type { LibraryPhoto } from '@/hooks/useStudioLibrary';
import type { StudioVideoAspect, StudioVideoScene, StudioVideoScriptResponse } from '@/types/studio';
import { LibraryUploadFlow, type UploadRequest } from './LibraryUploadFlow';
import { CreationReferences } from './CreationReferences';
import { ReferenceImagePanel } from './ReferenceImagePanel';

const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const CHIP_ON = 'border-brand bg-brand/10 text-text-primary font-semibold';
const CHIP_OFF = 'border-border text-text-secondary hover:bg-surface-secondary';
const FIELD = 'min-w-0 w-full resize-none rounded-xl border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';
// ritmo de fala natural pra caber no tempo da cena
const WORDS_PER_SECOND = 2.5;

const ASPECTS: Array<{ id: StudioVideoAspect; label: string; hint: string; Icon: typeof RectangleVertical }> = [
  { id: '9:16', label: 'Vertical', hint: '9:16 · Stories e Reels', Icon: RectangleVertical },
  { id: '16:9', label: 'Horizontal', hint: '16:9 · Feed e YouTube', Icon: RectangleHorizontal },
];

function apiError(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: { message?: string } } } } | null)?.response?.data?.error?.message;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface Props {
  onCreated: (jobId: string) => void;
}

export function VideoCreateForm({ onCreated }: Props) {
  const { data: options, isError: optionsError } = useStudioVideoOptions();
  const generateScript = useGenerateVideoScript();
  const createVideo = useCreateStudioVideo();

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<StudioVideoAspect>('9:16');
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]);
  const [script, setScript] = useState<StudioVideoScriptResponse | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const hasScript = !!script;
  useEffect(() => {
    if (hasScript) reviewHeading.current?.focus();
  }, [hasScript]);
  const [uploadRequest, setUploadRequest] = useState<UploadRequest | null>(null);

  const duration = options?.durations[0] ?? 15;
  const maxPhotos = options?.maxPhotos ?? 4;
  const promptLength = prompt.trim().length;
  // mesma regra das fotos: sem saldo no mês, não cria
  const quotaReached = options?.videosRemaining === 0;

  const handleScript = () => {
    if (promptLength < 10 || generateScript.isPending || quotaReached) return;
    generateScript.mutate(
      { prompt: prompt.trim(), photoIds: photos.map((p) => p.id), aspectRatio: aspect, duration },
      { onSuccess: (data) => setScript(data) },
    );
  };

  const updateScene = (index: number, patch: Partial<StudioVideoScene>) => {
    setScript((prev) => prev && { ...prev, scenes: prev.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };

  const scenesValid = !!script?.scenes.length && script.scenes.every((s) => s.visual.trim().length >= 3);

  const handleGenerate = () => {
    if (!script || !scenesValid || createVideo.isPending || quotaReached) return;
    createVideo.mutate(
      {
        prompt: prompt.trim(),
        scenes: script.scenes,
        photoIds: photos.map((p) => p.id),
        aspectRatio: aspect,
        duration,
      },
      { onSuccess: (data) => onCreated(data.jobId) },
    );
  };

  // acima do limite, a mais antiga sai (mesma regra da imagem)
  const addPhotos = (picked: LibraryPhoto[]) => {
    setPhotos((prev) => [...prev.filter((p) => !picked.some((n) => n.id === p.id)), ...picked].slice(-maxPhotos));
  };

  const togglePhoto = (photo: LibraryPhoto) => {
    if (photos.some((p) => p.id === photo.id)) setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    else addPhotos([photo]);
  };

  const errorMessage = apiError(createVideo.error) ?? apiError(generateScript.error)
    ?? (createVideo.isError || generateScript.isError ? 'Algo deu errado. Tente novamente.' : undefined);

  return (
    <div className="ady-decor w-full min-w-0 space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-text-primary">Criar vídeo</h2>
        <p className="text-sm text-text-secondary">Descreva sua ideia. Você revisa o roteiro antes de gerar.</p>
      </div>
      <ol
        aria-label="Etapas da criação de vídeo"
        className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-3"
      >
        {['Descrever', 'Revisar roteiro', 'Gerar vídeo'].map((step, i) => {
          const current = createVideo.isPending ? 2 : script ? 1 : 0;
          return (
            <li
              key={step}
              aria-current={i === current ? 'step' : undefined}
              className={`flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2 ${i === current ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i === current ? 'bg-brand-hover text-white' : 'bg-surface-secondary'}`}
              >
                {i + 1}
              </span>
              {step}
            </li>
          );
        })}
      </ol>
      {optionsError && (
        <div role="alert" className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-text-primary">
          A criação de vídeo está indisponível no momento. Tente novamente em alguns minutos.
        </div>
      )}
      <section className={`${SURFACE} space-y-3 p-4 sm:p-5`} aria-label="Descrição do vídeo">
        <label htmlFor="video-prompt" className="block text-base font-semibold text-text-primary">
          Sobre o que é o vídeo
        </label>
        <textarea
          id="video-prompt"
          aria-describedby="video-prompt-help"
          value={prompt}
          maxLength={1000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex: Lançamento do nosso café gelado de caramelo, para quem trabalha no centro e quer uma pausa rápida. Promoção na primeira compra pelo app."
          className={`${FIELD} min-h-36 px-4 py-3`}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-text-secondary">
          <p id="video-prompt-help">Conte a ideia e o que quer mostrar. Use pelo menos 10 caracteres.</p>
          <span className="shrink-0">{promptLength}/1000</span>
        </div>
      </section>
      {script && (
        <div className={`${SURFACE} space-y-4 p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <h3
                ref={reviewHeading}
                tabIndex={-1}
                className="text-base font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Revise o roteiro
              </h3>
              <p className="text-sm text-text-secondary">Revise e edite antes de gerar o vídeo</p>
            </div>
            <button
              type="button"
              onClick={handleScript}
              disabled={generateScript.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
            >
              {generateScript.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refazer roteiro
            </button>
          </div>
          {script.scenes.map((scene, i) => {
            const seconds = scene.end - scene.start;
            const tooLong = wordCount(scene.narration) > Math.ceil(seconds * WORDS_PER_SECOND);
            return (
              <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  Cena {i + 1}
                  <span className="inline-flex items-center gap-1 font-normal text-text-tertiary">
                    <Clock className="h-3 w-3" />
                    {scene.start}s–{scene.end}s
                  </span>
                </p>
                <label className="block space-y-1">
                  <span className="text-xs text-text-tertiary">O que aparece</span>
                  <textarea
                    value={scene.visual}
                    maxLength={600}
                    rows={2}
                    onChange={(e) => updateScene(i, { visual: e.target.value })}
                    className={FIELD}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-text-tertiary">Fala (narração)</span>
                  <textarea
                    value={scene.narration}
                    maxLength={400}
                    rows={2}
                    onChange={(e) => updateScene(i, { narration: e.target.value })}
                    className={FIELD}
                  />
                </label>
                {tooLong && (
                  <p className="text-xs text-warning">Fala longa para {seconds}s: pode ser cortada ou acelerada.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CreationReferences title="Fotos de referência" selected={photos.length}>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">Fotos no vídeo</p>
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
              {photos.length ? `${photos.length} de ${maxPhotos}` : `até ${maxPhotos}`}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            {photos.length
              ? 'Seu produto, você ou sua equipe aparecendo no vídeo.'
              : 'Toque nas fotos de produto ou equipe em "Suas imagens".'}
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                  aria-label="Remover foto do vídeo"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-tertiary hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          {photos.length < maxPhotos && (
            <button
              type="button"
              onClick={() =>
                setUploadRequest({ kinds: ['produto', 'equipe'], max: maxPhotos - photos.length, onDone: addPhotos })
              }
              className="ady-btn inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-600/60 bg-amber-500/5 px-3.5 py-2 text-xs font-semibold text-amber-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Enviar foto
            </button>
          )}
        </div>

        <ReferenceImagePanel
          hideTemplates
          templateId={null}
          artPhotoIds={photos.map((p) => p.id)}
          onToggleArtPhoto={togglePhoto}
          onUploadClick={() => setUploadRequest({ kinds: ['produto', 'equipe'], max: null })}
        />
      </CreationReferences>
      <div className={`${SURFACE} space-y-3 bg-surface-secondary p-4`}>
        <h3 className="text-sm font-semibold text-text-primary">Configurações do vídeo</h3>
        <p className="text-xs font-medium text-text-secondary">Formato</p>
        <div className="grid grid-cols-2 gap-2">
          {ASPECTS.map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={aspect === id}
              onClick={() => setAspect(id)}
              className={`ady-btn flex min-w-0 flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition ${aspect === id ? CHIP_ON : CHIP_OFF}`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className="text-[11px] font-normal text-text-tertiary">{hint}</span>
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Clock className="h-3.5 w-3.5" />
          Duração: {duration} segundos
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-text-secondary" aria-live="polite">
          {script
            ? 'Roteiro revisado? Agora você pode gerar o vídeo.'
            : 'Próximo passo: gerar o roteiro para revisar. O vídeo será gerado depois.'}
        </p>
        {quotaReached && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Limite de vídeos do mês atingido — faça upgrade do plano para continuar.
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-text-primary"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            {errorMessage}
          </div>
        )}

        {script ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!scenesValid || createVideo.isPending || quotaReached}
            className="ady-btn inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
          >
            {createVideo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Gerar vídeo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleScript}
            disabled={!options || promptLength < 10 || generateScript.isPending || quotaReached}
            className="ady-btn inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
          >
            {generateScript.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generateScript.isPending ? 'Escrevendo o roteiro...' : 'Gerar roteiro'}
          </button>
        )}
        <UsageBadge
          remaining={options?.videosRemaining ?? null}
          limit={options?.videosLimit ?? null}
          unit="vídeos"
          className="mt-1 w-full max-w-none"
        />
      </div>
      <LibraryUploadFlow request={uploadRequest} onClose={() => setUploadRequest(null)} />
    </div>
  );
}
