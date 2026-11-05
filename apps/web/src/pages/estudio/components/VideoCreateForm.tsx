import { useState } from 'react';
import { AlertCircle, Clock, Loader2, RectangleHorizontal, RectangleVertical, RefreshCw, Sparkles, Upload, Video, X } from 'lucide-react';
import { UsageBadge } from '@/components/UsageBadge';
import { useCreateStudioVideo, useGenerateVideoScript, useStudioVideoOptions } from '@/hooks/useStudioVideo';
import type { LibraryPhoto } from '@/hooks/useStudioLibrary';
import type { StudioVideoAspect, StudioVideoScene, StudioVideoScriptResponse } from '@/types/studio';
import { LibraryUploadFlow, type UploadRequest } from './LibraryUploadFlow';
import { ReferenceImagePanel } from './ReferenceImagePanel';

const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary';
const CHIP_ON = 'border-brand bg-brand/10 text-text-primary font-semibold';
const CHIP_OFF = 'border-border text-text-secondary hover:bg-surface-secondary';
const FIELD = 'w-full resize-none rounded-xl border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20';
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
    <div className="w-full space-y-5">
      {optionsError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          A criação de vídeo está indisponível no momento. Tente novamente em alguns minutos.
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className={`${SURFACE} space-y-3 p-5`}>
            <label htmlFor="video-prompt" className={`block ${LABEL}`}>Sobre o que é o vídeo</label>
            <textarea
              id="video-prompt"
              value={prompt}
              maxLength={1000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Lançamento do nosso café gelado de caramelo, para quem trabalha no centro e quer uma pausa rápida. Promoção na primeira compra pelo app."
              className={`${FIELD} min-h-36 px-4 py-3`}
            />
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <span>{promptLength}/1000</span>
              <span>A IA escreve o roteiro e você revisa antes de gerar</span>
            </div>
          </div>

          {script && (
            <div className={`${SURFACE} space-y-4 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <p className={LABEL}>Roteiro</p>
                  <p className="text-sm text-text-secondary">Revise e edite antes de gerar o vídeo</p>
                </div>
                <button
                  type="button"
                  onClick={handleScript}
                  disabled={generateScript.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
                >
                  {generateScript.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className={`${SURFACE} space-y-3 p-5`}>
            <p className={LABEL}>Formato</p>
            <div className="grid grid-cols-2 gap-2">
              {ASPECTS.map(({ id, label, hint, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={aspect === id}
                  onClick={() => setAspect(id)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition ${aspect === id ? CHIP_ON : CHIP_OFF}`}
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

          <div className={`${SURFACE} space-y-3 p-5`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className={LABEL}>Fotos no vídeo</p>
              <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                {photos.length ? `${photos.length} de ${maxPhotos}` : `até ${maxPhotos}`}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">
              {photos.length ? 'Seu produto, você ou sua equipe aparecendo no vídeo.' : 'Toque nas fotos de produto ou equipe em "Suas imagens".'}
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
                onClick={() => setUploadRequest({ kinds: ['produto', 'equipe'], max: maxPhotos - photos.length, onDone: addPhotos })}
                className="ady-btn inline-flex items-center gap-1.5 rounded-full border border-dashed border-amber-600/60 bg-amber-500/5 px-3.5 py-2 text-xs font-semibold text-amber-700"
              >
                <Upload className="h-3.5 w-3.5" />
                Enviar foto
              </button>
            )}
          </div>
          </div>

          {quotaReached && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Limite de vídeos do mês atingido — faça upgrade do plano para continuar.
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-text-primary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              {errorMessage}
            </div>
          )}

          {script ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!scenesValid || createVideo.isPending || quotaReached}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              {createVideo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Gerar vídeo
            </button>
          ) : (
            <button
              type="button"
              onClick={handleScript}
              disabled={!options || promptLength < 10 || generateScript.isPending || quotaReached}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            >
              {generateScript.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generateScript.isPending ? 'Escrevendo o roteiro...' : 'Gerar roteiro'}
            </button>
          )}
          <UsageBadge remaining={options?.videosRemaining ?? null} limit={options?.videosLimit ?? null} unit="vídeos" className="mt-1 w-full max-w-none" />
        </div>

        <ReferenceImagePanel
          hideTemplates
          templateId={null}
          artPhotoIds={photos.map((p) => p.id)}
          onToggleArtPhoto={togglePhoto}
          onUploadClick={() => setUploadRequest({ kinds: ['produto', 'equipe'], max: null })}
        />
      </div>

      <LibraryUploadFlow request={uploadRequest} onClose={() => setUploadRequest(null)} />
    </div>
  );
}
