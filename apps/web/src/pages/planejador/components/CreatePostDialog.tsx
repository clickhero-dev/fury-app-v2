import { useState, useRef, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { LayoutGrid, Image, Sparkles, Film, Upload, Trash2, X, Plus, FolderOpen, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import api from '@/lib/api';
import type { StudioAsset } from '@/types/studio';
import { publishNowToast } from '../plannerPage.utils';
import type { Post } from '../types';

interface Props {
  mode: 'schedule' | 'now';
  /** Fase 6: Legado — dia do mês (1-31) */
  preselectedDay?: number | null;
  /** Fase 8: Novo — ISO date string (ex: "2026-08-19") */
  preselectedDate?: string | null;
  /** Hora "HH:mm" do slot clicado (visão semana) */
  preselectedTime?: string;
  /** Edição: abre preenchido e salva via PATCH */
  editPost?: Post | null;
  onClose: () => void;
  onCreated: (message: string) => void;
  onError?: (msg: string) => void;
}

/** Hoje no fuso local (toISOString usaria UTC: após 21h viraria amanhã). */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TYPE_OPTIONS = [
  { value: 'image', label: 'Post', icon: Image, desc: 'Imagem única' },
  { value: 'carousel', label: 'Carrossel', icon: LayoutGrid, desc: 'De 2 a 10 mídias' },
  { value: 'reel', label: 'Reels', icon: Film, desc: 'Vídeo curto' },
  { value: 'stories', label: 'Stories', icon: Sparkles, desc: 'Efêmero 24h' },
] as const;

const MAX_CAROUSEL_IMAGES = 10;
// Meta exige no mínimo 2 itens
const MIN_CAROUSEL_IMAGES = 2;

/** Resposta completa de GET /studio/assets (mesmo shape cacheado pelo EstudioHome). */
interface StudioAssetsResponse {
  assets: StudioAsset[];
  total: number;
  page: number;
  totalPages: number;
  creativesRemaining?: number | null;
  creativesLimit?: number | null;
}

type MediaKind = 'image' | 'video';
/** Mídias aceitas por tipo de post. */
const allowedKinds = (postType: string): MediaKind[] =>
  postType === 'image' ? ['image'] : postType === 'reel' ? ['video'] : ['image', 'video'];
const fileKind = (f: File) => f.type.split('/')[0] as MediaKind;
const urlKind = (url: string): MediaKind => (/\.(mp4|mov)(\?|$)/i.test(url) ? 'video' : 'image');

/** Mídia atual do post ainda serve para o tipo? */
const existingFits = (urls: string[], postType: string) =>
  urls.every(u => allowedKinds(postType).includes(urlKind(u))) &&
  (postType === 'carousel' ? urls.length >= 2 : urls.length === 1);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** URL absoluta do asset do Estúdio (alguns vêm relativos à API). */
const assetSrc = (url: string) =>
  url.startsWith('http') ? url : `${api.defaults.baseURL?.replace(/\/api$/, '')}${url}`;

/** Moldura da prévia no formato real: feed 1:1, reels/stories 9:16. */
const frameClass = (postType: string) =>
  postType === 'reel' || postType === 'stories'
    ? 'mx-auto h-[min(55vh,480px)] aspect-[9/16]'
    : 'w-full aspect-square';

function MediaPreview({ src, isVideo, postType, children }: { src: string; isVideo: boolean; postType: string; children?: React.ReactNode }) {
  return (
    <div className={clsx('relative group rounded-xl overflow-hidden border border-border bg-black', frameClass(postType))}>
      {isVideo ? (
        <video src={src} controls className="w-full h-full object-cover" />
      ) : postType === 'stories' ? (
        // mesmo ajuste do backend: imagem inteira sobre fundo desfocado
        <>
          <img src={src} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 brightness-75" />
          <img src={src} alt="Preview" className="relative w-full h-full object-contain" />
        </>
      ) : (
        <img src={src} alt="Preview" className="w-full h-full object-cover" />
      )}
      {children}
    </div>
  );
}

const MEDIA_SOURCE_OPTIONS = [
  { value: 'upload', label: 'Enviar mídia', icon: Upload, desc: 'Carregar do seu dispositivo' },
  { value: 'library', label: 'Biblioteca do Estúdio', icon: FolderOpen, desc: 'Usar imagem já gerada' },
] as const;

export function CreatePostDialog({ mode, onClose, onCreated, preselectedDay, preselectedDate, preselectedTime, editPost, onError }: Props) {
  const isEdit = !!editPost;
  // Horário do post em edição no fuso local
  const editAt = editPost?.scheduledAt ? new Date(editPost.scheduledAt) : null;
  const [caption, setCaption] = useState(editPost?.caption ?? '');
  const [postType, setPostType] = useState(editPost?.postType ?? 'image');
  const [scheduledDate, setScheduledDate] = useState(
    editAt
      ? `${editAt.getFullYear()}-${pad2(editAt.getMonth() + 1)}-${pad2(editAt.getDate())}`
      : isEdit ? '' : preselectedDate || (mode === 'schedule' ? todayLocal() : ''),
  );
  const [scheduledTime, setScheduledTime] = useState(
    editAt ? `${pad2(editAt.getHours())}:${pad2(editAt.getMinutes())}` : preselectedTime || '',
  );
  // Mídia já salva no post (edição) até o usuário trocar
  const [existingUrls, setExistingUrls] = useState<string[]>(() => {
    if (!editPost) return [];
    if (editPost.postType === 'carousel') return editPost.imageUrls ?? [];
    return editPost.imageUrl ? [editPost.imageUrl] : [];
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [carouselFiles, setCarouselFiles] = useState<File[]>([]);
  const [carouselPreviews, setCarouselPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showSchedule, setShowSchedule] = useState(mode === 'schedule' || !!preselectedDate);
  const [mediaSource, setMediaSource] = useState<'upload' | 'library'>('upload');
  const [selectedLibraryAssets, setSelectedLibraryAssets] = useState<StudioAsset[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch studio assets for library picker
  const { data: studioAssetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['studio/assets'],
    queryFn: async () => {
      const response = await api.get<StudioAssetsResponse>('/studio/assets');
      return response.data;
    },
    retry: 1,
  });

  // Mesma chave ['studio/assets'] do EstudioHome → cache compartilhado traz o
  // CORPO COMPLETO (não o array). Lê `assets` para não quebrar com `.filter`.
  // Filtro de aprovadas desativado (compliance desligado)
  // const libraryImages = studioAssetsData?.assets?.filter(a => a.type === 'image' && a.url && a.complianceStatus === 'approved') ?? [];
  const libraryImages = studioAssetsData?.assets?.filter(a => a.type === 'image' && a.url) ?? [];

  // Vídeos em query própria (a lista padrão mistura tipos e pagina em 20)
  const kinds = allowedKinds(postType);
  const { data: studioVideosData, isLoading: videosLoading } = useQuery({
    queryKey: ['studio/assets', 'video'],
    queryFn: async () => {
      const response = await api.get<StudioAssetsResponse>('/studio/assets', { params: { type: 'video', limit: 50 } });
      return response.data;
    },
    enabled: mediaSource === 'library' && kinds.includes('video'),
    retry: 1,
  });
  const libraryVideos = studioVideosData?.assets?.filter(a => a.type === 'video' && a.url) ?? [];
  const libraryItems = [
    ...(kinds.includes('video') ? libraryVideos : []),
    ...(kinds.includes('image') ? libraryImages : []),
  ];
  const libraryLoading = assetsLoading || (kinds.includes('video') && videosLoading);

  // Fase 8: Prioriza preselectedDate (novo) sobre preselectedDay (legado)
  const getEffectiveDate = (): string => {
    if (preselectedDate) return preselectedDate; // ISO string: "2026-08-19"
    if (preselectedDay) {
      // Legado: construir ISO date a partir de dia do mês
      const now = new Date();
      const dateObj = new Date(now.getFullYear(), now.getMonth(), preselectedDay);
      return dateObj.toISOString().split('T')[0];
    }
    // Default: hoje
    return todayLocal();
  };

  const effectiveDate = getEffectiveDate();
  // Extrair dayIndex do effective date (para compatibilidade backward)
  const dayIndexFromDate = parseInt(effectiveDate.split('-')[2]);

  const scheduledAt = scheduledDate && scheduledTime
    ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
    : '';
  // Agendar exige data + hora no futuro (sem hora o job nunca publica)
  const scheduleInPast = !!scheduledAt && new Date(scheduledAt) <= new Date();
  const scheduleValid = !!scheduledAt && !scheduleInPast;

  const handleFile = (file: File) => {
    if (!allowedKinds(postType).includes(fileKind(file))) {
      onError?.(postType === 'reel' ? 'Reels aceita só vídeo (MP4 ou MOV).' : 'Post aceita só imagem.');
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleCarouselFiles = (files: File[]) => {
    // Carrossel: só imagens ou só vídeos (o 1º arquivo define)
    const media = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const kind = (carouselFiles[0] ?? media[0])?.type.split('/')[0];
    const sameKind = media.filter(f => f.type.startsWith(`${kind}/`));
    if (sameKind.length < media.length) {
      onError?.('Carrossel aceita só imagens ou só vídeos, sem misturar.');
    }
    const remainingSlots = MAX_CAROUSEL_IMAGES - carouselFiles.length;
    const toAdd = sameKind.slice(0, remainingSlots);
    const newFiles = [...carouselFiles, ...toAdd];
    const newPreviews = toAdd.map(f => URL.createObjectURL(f));
    setCarouselFiles(newFiles);
    setCarouselPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeCarouselFile = (idx: number) => {
    setCarouselFiles(prev => prev.filter((_, i) => i !== idx));
    setCarouselPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleCarouselDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleCarouselFiles(Array.from(e.dataTransfer.files));
  };

  const isNow = mode === 'now';
  // Edições limpas o estado de retry (o retry republica o conteúdo GRAVADO no
  // post failed; mudar o form sem isso enganaria o usuário).
  const clearRetryState = () => setFailedPostId(null);

  // Publish-now: key de idempotência NOVA a cada clique (gerada no início do
  // mutationFn): o replay estrito do servidor protege reenvio de rede do MESMO
  // clique; duplo-clique é bloqueado pelo disabled do botão + inflight 409.
  // Retry usa key nova + retryPostId — republica o post failed SEM criar outro.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  // Post failed aguardando decisão do usuário (retry no próprio dialog).
  const [failedPostId, setFailedPostId] = useState<string | null>(null);

  const submitLabel = isEdit ? 'Salvar' : isNow ? (failedPostId ? 'Tentar novamente' : 'Postar agora') : 'Criar post';
  const loadingLabel = isEdit ? 'Salvando...' : isNow ? 'Publicando...' : 'Criando...';

  const uploadMedia = async (): Promise<{ imageUrl?: string; imageUrls?: string[] }> => {
    if (existingUrls.length > 0) {
      return postType === 'carousel' ? { imageUrls: existingUrls } : { imageUrl: existingUrls[0] };
    }
    // Handle library selection
    if (mediaSource === 'library' && selectedLibraryAssets.length > 0) {
      const urls = selectedLibraryAssets.map(a => a.url).filter((u): u is string => !!u);
      return postType === 'carousel' ? { imageUrls: urls } : { imageUrl: urls[0] };
    }
    let imageUrl: string | undefined;
    let imageUrls: string[] | undefined;
    // Upload single image/video
    if (mediaFile) {
      const formData = new FormData();
      formData.append('file', mediaFile);
      const { data: uploadRes } = await api.post('/planner/posts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      imageUrl = uploadRes.data.url;
    }
    // Upload carousel images
    if (postType === 'carousel' && carouselFiles.length > 0) {
      const uploadedUrls: string[] = [];
      for (const file of carouselFiles) {
        const formData = new FormData();
        formData.append('file', file);
        const { data: uploadRes } = await api.post('/planner/posts/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedUrls.push(uploadRes.data.url);
      }
      imageUrls = uploadedUrls.length > 0 ? uploadedUrls : undefined;
    }
    return { imageUrl, imageUrls };
  };

  const mutation = useMutation({
    mutationFn: async () => {
      // Key NOVA por clique — cada submissão é uma intenção única no servidor.
      idempotencyKeyRef.current = crypto.randomUUID();

      // Retry: republica o post failed existente (conteúdo gravado no post —
      // edições no dialog não entram no retry; editar limpa o estado de retry).
      if (isNow && failedPostId) {
        const { data: pubRes } = await api.post('/planner/posts/publish-now',
          { retryPostId: failedPostId },
          { headers: { 'Idempotency-Key': idempotencyKeyRef.current } },
        );
        return pubRes;
      }

      const media = await uploadMedia();
      // uploads entram na biblioteca do Estúdio
      if (mediaSource === 'upload') queryClient.invalidateQueries({ queryKey: ['studio/assets'] });

      if (isEdit) {
        // Sem data e hora: volta a rascunho
        const { data } = await api.patch(`/planner/posts/${editPost!.id}`, {
          caption,
          postType,
          imageUrl: postType === 'carousel' ? null : media.imageUrl,
          imageUrls: postType === 'carousel' ? media.imageUrls : [],
          scheduledAt: scheduledAt || null,
        });
        return data;
      }

      if (isNow) {
        // Postar agora: cria + publica num request (endpoint idempotente)
        const { data: pubRes } = await api.post('/planner/posts/publish-now',
          { caption, postType, imageUrl: media.imageUrl, imageUrls: media.imageUrls },
          { headers: { 'Idempotency-Key': idempotencyKeyRef.current } },
        );
        return pubRes;
      }

      // Fase 8: Enviar `date` (novo formato) ao invés de `dayIndex` (legado)
      await api.post('/planner/posts', {
        caption,
        postType,
        date: scheduledDate || effectiveDate, // ISO string: "2026-08-19"
        scheduledAt: scheduledAt || undefined,
        imageUrl: media.imageUrl,
        imageUrls: media.imageUrls,
      });
      return null;
    },
    onSuccess: (pubRes) => {
      if (isEdit) {
        onCreated('Post atualizado!');
        return;
      }
      if (isNow) {
        if (pubRes?.data?.status === 'failed') {
          // Post existe como failed: dialog PERMANECE aberto com botão
          // "Tentar novamente" (nova key + retryPostId). Toast mostra o erro real.
          setFailedPostId(pubRes.data.id);
          onError?.(publishNowToast({ data: pubRes.data }));
          return;
        }
        onCreated(publishNowToast({ data: pubRes?.data }));
        return;
      }
      onCreated('Post criado com sucesso!');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Erro ao criar post';
      onError?.(msg);
    },
  });

  const carouselCount = mediaSource === 'library' ? selectedLibraryAssets.length : carouselFiles.length;
  // Edição pode ficar sem agendamento (rascunho); criação agendada exige data + hora
  const scheduleOk = mode === 'now' || scheduleValid || (isEdit && !scheduledDate && !scheduledTime);
  const mediaOk = existingUrls.length > 0
    ? existingFits(existingUrls, postType)
    : (postType === 'carousel' && carouselCount >= MIN_CAROUSEL_IMAGES) ||
      (postType !== 'carousel' && (mediaSource === 'library' ? selectedLibraryAssets.length === 1 : !!mediaFile));
  const canCreate = caption.trim() && !mutation.isPending && scheduleOk && mediaOk;

  // Seleção múltipla na biblioteca só no carrossel
  const toggleLibraryAsset = (asset: StudioAsset) => {
    clearRetryState();
    setSelectedLibraryAssets(prev => {
      if (prev.some(a => a.id === asset.id)) return prev.filter(a => a.id !== asset.id);
      if (postType !== 'carousel') return [asset];
      if (prev[0] && prev[0].type !== asset.type) {
        onError?.('Carrossel aceita só imagens ou só vídeos, sem misturar.');
        return prev;
      }
      return prev.length < MAX_CAROUSEL_IMAGES ? [...prev, asset] : prev;
    });
  };

  return (
    <div className="ady-decor fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h3 className="text-lg font-bold text-text-primary">{isEdit ? 'Editar post' : isNow ? 'Postar agora' : 'Novo post'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: media upload */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
              Mídia <span className="text-error">*</span>
            </label>

            {existingUrls.length > 0 ? (
              // Mídia atual do post (edição)
              <div>
                {postType === 'carousel' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {existingUrls.map((url, idx) => (
                      <div key={idx} className="relative rounded-xl overflow-hidden border border-border bg-black aspect-square">
                        {urlKind(url) === 'video'
                          ? <video src={url} muted className="w-full h-full object-cover" />
                          : <img src={url} alt={`Mídia ${idx + 1}`} className="w-full h-full object-cover" />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <MediaPreview src={existingUrls[0]} isVideo={urlKind(existingUrls[0]) === 'video'} postType={postType} />
                )}
                <button
                  type="button"
                  onClick={() => { setExistingUrls([]); clearRetryState(); }}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-border text-sm font-medium text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-colors"
                >
                  Trocar mídia
                </button>
              </div>
            ) : (
            <>
            {/* Media source selector: Upload vs Library */}
            <div className="flex gap-2 mb-3">
              {MEDIA_SOURCE_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setMediaSource(opt.value);
                      if (opt.value === 'upload') {
                        setSelectedLibraryAssets([]);
                      }
                      clearRetryState();
                    }}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border transition-all text-sm font-medium',
                      mediaSource === opt.value
                        ? 'border-accent bg-accent/10 text-accent shadow-[0_0_12px_rgba(234,88,12,0.15)]'
                        : 'border-border hover:border-text-tertiary text-text-secondary hover:text-text-primary',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {mediaSource === 'upload' ? (
              // Upload mode
              <>
                {postType === 'carousel' ? (
                  // Carousel: multiple images
                  <div>
                    {carouselPreviews.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {carouselPreviews.map((preview, idx) => {
                          return (
                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-border bg-surface-secondary aspect-square">
                              {carouselFiles[idx]?.type.startsWith('video/') ? (
                                <video src={preview} muted className="w-full h-full object-cover" />
                              ) : (
                                <img src={preview} alt={`Carousel ${idx + 1}`} className="w-full h-full object-cover" />
                              )}
                              <button
                                onClick={() => removeCarouselFile(idx)}
                                className="absolute top-1 right-1 p-1 rounded bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {carouselFiles.length < MAX_CAROUSEL_IMAGES && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleCarouselDrop}
                        onClick={() => carouselInputRef.current?.click()}
                        className={clsx(
                          'flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all',
                          dragOver
                            ? 'border-accent bg-accent/10'
                            : 'border-border hover:border-text-tertiary bg-surface-secondary',
                        )}
                      >
                        <Plus className="h-8 w-8 text-text-tertiary mb-2" />
                        <p className="text-sm text-text-secondary font-medium">Adicionar mídia ({carouselFiles.length}/{MAX_CAROUSEL_IMAGES})</p>
                        <p className="text-xs text-text-tertiary mt-1">Mínimo {MIN_CAROUSEL_IMAGES} · só imagens ou só vídeos</p>
                      </div>
                    )}
                    <input
                      ref={carouselInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
                      multiple
                      onChange={e => e.target.files && handleCarouselFiles(Array.from(e.target.files))}
                      className="hidden"
                    />
                  </div>
                ) : (
                  // Single image/video
                  <div>
                    {mediaPreview ? (
                      <MediaPreview src={mediaPreview} isVideo={!!mediaFile?.type.startsWith('video/')} postType={postType}>
                        <button
                          onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                          <p className="text-xs text-white font-medium truncate">{mediaFile?.name}</p>
                          <p className="text-[10px] text-white/70">{(mediaFile!.size / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                      </MediaPreview>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={clsx(
                          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all',
                          frameClass(postType),
                          dragOver
                            ? 'border-accent bg-accent/10 scale-[1.02]'
                            : 'border-border hover:border-text-tertiary bg-surface-secondary',
                        )}
                      >
                        <Upload className="h-8 w-8 text-text-tertiary mb-2" />
                        <p className="text-sm text-text-secondary font-medium">Arraste ou clique</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {postType === 'reel' ? 'MP4 ou MOV' : postType === 'image' ? 'PNG, JPG, WebP' : 'PNG, JPG, WebP, MP4'}
                        </p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={[
                        kinds.includes('image') && 'image/png,image/jpeg,image/webp',
                        kinds.includes('video') && 'video/mp4,video/quicktime',
                      ].filter(Boolean).join(',')}
                      onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                      className="hidden"
                    />
                  </div>
                )}
              </>
            ) : (
              // Library mode
              <div>
                {libraryLoading ? (
                  <div className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed bg-surface-secondary">
                    <Loader2 className="h-8 w-8 animate-spin text-brand mb-2" />
                    <p className="text-sm text-text-secondary font-medium">Carregando biblioteca...</p>
                  </div>
                ) : libraryItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed bg-surface-secondary text-center px-4">
                    <ImageIcon className="h-10 w-10 text-text-tertiary mb-2" />
                    <p className="text-sm text-text-secondary font-medium">
                      {postType === 'reel' ? 'Nenhum vídeo na biblioteca' : 'Nenhuma imagem na biblioteca'}
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">Crie no Estúdio ou mude para "Enviar mídia"</p>
                  </div>
                ) : (
                  <>
                  {postType !== 'carousel' && selectedLibraryAssets[0]?.url && (
                    <div className="mb-3">
                      <MediaPreview
                        src={assetSrc(selectedLibraryAssets[0].url)}
                        isVideo={selectedLibraryAssets[0].type === 'video'}
                        postType={postType}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {libraryItems.map((asset) => {
                      const imageUrl = assetSrc(asset.url ?? '');
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => toggleLibraryAsset(asset)}
                          className={clsx(
                            'relative aspect-square rounded-xl overflow-hidden border-2 transition-all',
                            selectedLibraryAssets.some(a => a.id === asset.id)
                              ? 'border-accent ring-2 ring-accent/30'
                              : 'border-transparent hover:border-brand/50',
                          )}
                        >
                          {asset.type === 'video' ? (
                            <>
                              <video src={`${imageUrl}#t=0.5`} muted preload="metadata" aria-label={asset.name || 'Vídeo do Estúdio'} className="w-full h-full object-cover" />
                              <Film className="absolute bottom-1 left-1 h-4 w-4 text-white drop-shadow" />
                            </>
                          ) : (
                            <img
                              src={imageUrl}
                              alt={asset.name || 'Asset do Estúdio'}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {selectedLibraryAssets.some(a => a.id === asset.id) && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <div className="bg-accent rounded-full p-1.5">
                                <Check className="h-5 w-5 text-white" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  </>
                )}
                {postType === 'carousel' ? (
                  <p className="mt-2 text-xs text-text-tertiary text-center">
                    {selectedLibraryAssets.length}/{MAX_CAROUSEL_IMAGES} selecionadas · mínimo {MIN_CAROUSEL_IMAGES}
                  </p>
                ) : selectedLibraryAssets[0] && (
                  <p className="mt-2 text-xs text-text-tertiary text-center">
                    Selecionado: {selectedLibraryAssets[0].name || 'Mídia do Estúdio'}
                  </p>
                )}
              </div>
            )}
            </>
            )}
          </div>

          {/* Right: post details */}
          <div className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setPostType(opt.value);
                        // descarta mídia incompatível com o novo tipo
                        const next = allowedKinds(opt.value);
                        setSelectedLibraryAssets(prev => {
                          const ok = prev.filter(a => next.includes(a.type as MediaKind));
                          return opt.value === 'carousel' ? ok : ok.slice(0, 1);
                        });
                        if (existingUrls.length > 0 && !existingFits(existingUrls, opt.value)) setExistingUrls([]);
                        if (mediaFile && !next.includes(fileKind(mediaFile))) {
                          setMediaFile(null);
                          setMediaPreview(null);
                        }
                      }}
                      className={clsx(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-left',
                        postType === opt.value
                          ? 'border-accent bg-accent/10 text-accent shadow-[0_0_12px_rgba(234,88,12,0.15)]'
                          : 'border-border hover:border-text-tertiary text-text-secondary hover:text-text-primary',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule */}
            {isNow && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSchedule}
                  onChange={e => setShowSchedule(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-surface-secondary text-accent focus:ring-accent/20"
                />
                <span className="text-sm text-text-secondary">Agendar para depois</span>
              </label>
            )}

            {showSchedule && (
              <div>
                <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
                  Agendar publicação
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-text-tertiary mb-1">Data</label>
                    <input
                      type="date"
                      min={todayLocal()}
                      value={scheduledDate}
                      onChange={e => setScheduledDate(e.target.value)}
                      className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-text-tertiary mb-1">Hora</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                      className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                </div>
                {isNow && (
                  <p className="text-[10px] text-text-tertiary mt-1">O post será agendado em vez de publicado agora</p>
                )}
                {!isNow && (
                  <p className={clsx('text-[10px] mt-1', scheduleInPast ? 'text-error' : 'text-text-tertiary')}>
                    {scheduleInPast
                      ? 'Escolha um horário no futuro'
                      : isEdit && !scheduledDate && !scheduledTime
                        ? 'Sem data e hora o post fica como rascunho'
                        : 'Publicado automaticamente na data e hora escolhidas'}
                  </p>
                )}
              </div>
            )}

            {/* Caption */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
                Legenda <span className="text-error">*</span>
              </label>
              <textarea
                value={caption}
                onChange={e => { setCaption(e.target.value); clearRetryState(); }}
                rows={4}
                className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm resize-none focus:border-accent focus:outline-none transition-colors"
                placeholder="Escreva a legenda do post..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface-secondary hover:bg-border text-text-primary text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!canCreate}
                className={clsx(
                  'flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all',
                  canCreate
                    ? isNow ? 'bg-green-600 hover:bg-green-500 active:scale-[0.98]' : 'bg-accent hover:bg-accent-light active:scale-[0.98]'
                    : 'bg-surface-secondary text-text-tertiary cursor-not-allowed',
                )}
              >
                {mutation.isPending ? loadingLabel : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
