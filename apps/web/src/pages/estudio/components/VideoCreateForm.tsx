import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Clock, Loader2, Pause, Play, Sparkles, Upload } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { builtinSongUrl, useCreateStudioVideo, useStudioVideoOptions, useUploadVideoMusic } from '@/hooks/useStudioVideo';
import type { StudioVideoMusicMode } from '@/types/studio';

const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary';
const CHIP_ON = 'bg-brand text-white font-semibold shadow-sm';
const CHIP_OFF = 'text-text-tertiary hover:text-text-primary hover:bg-surface-secondary font-medium';

const MUSIC_MODES: Array<{ id: StudioVideoMusicMode; label: string }> = [
  { id: 'none', label: 'Sem música' },
  { id: 'random', label: 'Aleatória' },
  { id: 'preset', label: 'Predefinida' },
  { id: 'custom', label: 'Personalizada' },
];

const POSITIONS = [
  { id: 'top', label: 'Em cima' },
  { id: 'center', label: 'Meio' },
  { id: 'bottom', label: 'Embaixo' },
] as const;

interface Props {
  onCreated: (jobId: string) => void;
}

export function VideoCreateForm({ onCreated }: Props) {
  const { data: options, isLoading: optionsLoading, isError: optionsError } = useStudioVideoOptions();
  const createVideo = useCreateStudioVideo();
  const uploadMusic = useUploadVideoMusic();

  const [prompt, setPrompt] = useState('');
  const [voice, setVoice] = useState('pt-BR-AntonioNeural-Male');
  const [voiceRate, setVoiceRate] = useState(1);
  const [musicMode, setMusicMode] = useState<StudioVideoMusicMode>('random');
  const [presetFile, setPresetFile] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.2);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [subsPosition, setSubsPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [transition, setTransition] = useState('Shuffle');

  // Player único de prévia (vozes e músicas)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePreview = (key: string, src: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingKey(null);
    }
    const audio = audioRef.current;
    if (playingKey === key) {
      audio.pause();
      setPlayingKey(null);
      return;
    }
    audio.src = src;
    audio.currentTime = 0;
    void audio.play().catch(() => setPlayingKey(null));
    setPlayingKey(key);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadMusic.mutate(file, { onSuccess: (track) => setTrackId(track.id) });
  };

  const promptLength = prompt.trim().length;
  const musicInvalid = (musicMode === 'preset' && !presetFile) || (musicMode === 'custom' && !trackId);
  const canGenerate = !!options && promptLength >= 10 && !musicInvalid && !createVideo.isPending;
  const transitionLabel = options?.transitions.find((t) => t.id === transition)?.label ?? 'Aleatória';

  const handleGenerate = () => {
    if (!canGenerate) return;
    createVideo.mutate(
      {
        prompt: prompt.trim(),
        voice,
        voiceRate,
        music: {
          mode: musicMode,
          file: musicMode === 'preset' ? presetFile ?? undefined : undefined,
          trackId: musicMode === 'custom' ? trackId ?? undefined : undefined,
          volume,
        },
        subtitles: { enabled: subsEnabled, position: subsPosition },
        transition,
      },
      { onSuccess: (data) => onCreated(data.jobId) },
    );
  };

  const createError = (createVideo.error as { response?: { data?: { error?: { message?: string } } } } | null)
    ?.response?.data?.error?.message;

  return (
    <div className="w-full space-y-5">
      {optionsError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          A criação de vídeo está indisponível no momento. Tente novamente em alguns minutos.
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <div className={`${SURFACE} space-y-3 p-5`}>
            <label htmlFor="video-prompt" className={`block ${LABEL}`}>Tema do vídeo</label>
            <textarea
              id="video-prompt"
              value={prompt}
              maxLength={1000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Pizzaria artesanal com forno a lenha no centro da cidade, massa de fermentação lenta, ambiente aconchegante para a família..."
              className="min-h-48 w-full resize-none rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <span>{promptLength}/1000</span>
              <span>Quanto mais detalhes do seu negócio, melhor o roteiro</span>
            </div>
          </div>

          <div className={`${SURFACE} space-y-4 p-5`}>
            <div className="space-y-1">
              <p className={LABEL}>Voz da narração</p>
              <p className="text-sm text-text-secondary">Ouça antes de escolher</p>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {(options?.voices ?? []).map((v) => {
                const selected = voice === v.id;
                const previewKey = `voice:${v.key}`;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                      selected ? 'border-brand bg-brand/10' : 'border-border bg-surface-secondary'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setVoice(v.id)}
                      aria-pressed={selected}
                      className="flex min-h-11 flex-1 flex-col items-start justify-center text-left"
                    >
                      <span className="text-sm font-semibold text-text-primary">{v.name}</span>
                      <span className="text-xs text-text-tertiary">{v.gender}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePreview(previewKey, `/audio/voices/${v.key}.mp3`)}
                      aria-label={`${playingKey === previewKey ? 'Pausar' : 'Ouvir'} voz ${v.name}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-primary hover:border-brand/40"
                    >
                      {playingKey === previewKey ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
              {optionsLoading && <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="voice-rate" className="text-sm font-medium text-text-primary">Velocidade da fala</label>
                <span className="text-sm font-semibold text-brand">
                  {voiceRate === 1 ? 'Normal' : `${voiceRate.toFixed(2).replace('.', ',')}x`}
                </span>
              </div>
              <input
                id="voice-rate"
                type="range"
                min={0.8}
                max={1.2}
                step={0.05}
                value={voiceRate}
                onChange={(e) => setVoiceRate(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-[11px] text-text-tertiary">
                <span>Mais lenta</span>
                <span>Normal</span>
                <span>Mais rápida</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className={`${SURFACE} space-y-3.5 p-5`}>
            <p className={LABEL}>Música de fundo</p>
            <div className="grid grid-cols-2 gap-2">
              {MUSIC_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMusicMode(m.id)}
                  aria-pressed={musicMode === m.id}
                  className={`min-h-10 rounded-xl border text-sm transition ${
                    musicMode === m.id ? `border-brand ${CHIP_ON}` : `border-border bg-surface-secondary ${CHIP_OFF}`
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {musicMode === 'random' && (
              <p className="rounded-xl bg-surface-secondary px-3 py-2.5 text-xs leading-relaxed text-text-secondary">
                Sorteamos uma música entre as do app e as que você enviou.
              </p>
            )}

            {musicMode === 'preset' && (
              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                {(options?.builtinSongs ?? []).map((song) => {
                  const selected = presetFile === song.file;
                  const previewKey = `song:${song.file}`;
                  const playing = playingKey === previewKey;
                  return (
                    <div
                      key={song.file}
                      className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1 ${
                        selected ? 'border-brand bg-brand/10' : 'border-transparent bg-surface-secondary'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePreview(previewKey, builtinSongUrl(song.previewPath))}
                        aria-label={`${playing ? 'Pausar' : 'Ouvir'} ${song.label}`}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${playing ? 'bg-brand' : 'bg-text-tertiary/40'}`}
                      >
                        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPresetFile(song.file)}
                        aria-pressed={selected}
                        className="flex min-h-8 flex-1 items-center justify-between text-sm text-text-primary"
                      >
                        {song.label}
                        {selected && <Check className="h-4 w-4 text-brand" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {musicMode === 'custom' && (
              <div className="space-y-2.5">
                <label
                  className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand/10 px-3 py-3.5 text-xs font-semibold text-brand transition hover:bg-brand/20 ${
                    uploadMusic.isPending ? 'cursor-wait opacity-60' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploadMusic.isPending}
                    aria-label="Enviar música"
                  />
                  {uploadMusic.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadMusic.isPending ? 'Enviando...' : 'Enviar música (MP3, WAV, M4A · até 30 MB)'}
                </label>
                {uploadMusic.isError && (
                  <p className="flex items-center gap-1.5 text-xs text-error">
                    <AlertCircle className="h-3.5 w-3.5" /> Não foi possível enviar essa música. Tente outro arquivo.
                  </p>
                )}
                {(options?.userTracks.length ?? 0) > 0 && <p className="text-xs text-text-tertiary">Suas músicas</p>}
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {(options?.userTracks ?? []).map((track) => {
                    const selected = trackId === track.id;
                    const previewKey = `track:${track.id}`;
                    const playing = playingKey === previewKey;
                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-1 ${
                          selected ? 'border-brand bg-brand/10' : 'border-transparent bg-surface-secondary'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => togglePreview(previewKey, track.previewUrl)}
                          aria-label={`${playing ? 'Pausar' : 'Ouvir'} ${track.name}`}
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${playing ? 'bg-brand' : 'bg-text-tertiary/40'}`}
                        >
                          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrackId(track.id)}
                          aria-pressed={selected}
                          className="flex min-h-8 min-w-0 flex-1 items-center justify-between gap-2 text-sm text-text-primary"
                        >
                          <span className="truncate">{track.name}</span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-brand" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {musicMode !== 'none' && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="music-volume" className="text-sm font-medium text-text-primary">Volume da música</label>
                  <span className="text-sm font-semibold text-brand">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  id="music-volume"
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-brand"
                />
                <p className="text-[11px] text-text-tertiary">Mais baixo deixa a narração em destaque</p>
              </div>
            )}
          </div>

          <div className={`${SURFACE} space-y-3.5 p-5`}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className={LABEL}>Legenda</p>
                <p className="text-xs text-text-secondary">Texto da narração na tela</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={subsEnabled}
                aria-label="Mostrar legenda"
                onClick={() => setSubsEnabled((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition ${subsEnabled ? 'bg-brand' : 'bg-text-tertiary/40'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${subsEnabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            {subsEnabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Posição</p>
                <div className="grid grid-cols-3 gap-1 rounded-full border border-border bg-surface-secondary p-1">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSubsPosition(p.id)}
                      aria-pressed={subsPosition === p.id}
                      className={`min-h-9 rounded-full text-xs transition ${subsPosition === p.id ? CHIP_ON : CHIP_OFF}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`${SURFACE} space-y-2.5 p-5`}>
            <p id="video-transition-label" className={LABEL}>Transição entre cenas</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-labelledby="video-transition-label"
                  disabled={!options}
                  className="flex min-h-10 w-full items-center justify-between gap-2 rounded-full border border-border bg-surface-secondary px-4 text-sm text-text-primary transition hover:border-brand/40 disabled:opacity-50"
                >
                  {transitionLabel}
                  <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {(options?.transitions ?? []).map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => setTransition(t.id)} className="flex items-center justify-between gap-3">
                    {t.label}
                    {t.id === transition && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className={`${SURFACE} flex flex-wrap items-center justify-between gap-4 px-5 py-3.5`}>
        <div className="flex items-center gap-2.5 text-sm text-text-secondary">
          <Clock className="h-4 w-4 text-text-tertiary" />
          Vídeo vertical 9:16 · leva em média de 5 a 8 minutos
        </div>
        <div className="flex items-center gap-3">
          {createError && (
            <span className="flex items-center gap-1.5 text-xs text-error">
              <AlertCircle className="h-3.5 w-3.5" /> {createError}
            </span>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-hover px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {createVideo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar vídeo
          </button>
        </div>
      </div>
    </div>
  );
}
