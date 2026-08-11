import { useState, useRef, type DragEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { LayoutGrid, Image, Sparkles, Film, Upload, Trash2, X } from 'lucide-react';
import api from '@/lib/api';

interface Props {
  mode: 'schedule' | 'now';
  preselectedDay?: number | null;
  onClose: () => void;
  onCreated: (message: string) => void;
  onError?: (msg: string) => void;
}

const TYPE_OPTIONS = [
  { value: 'image', label: 'Post', icon: Image, desc: 'Imagem única' },
  { value: 'carousel', label: 'Carrossel', icon: LayoutGrid, desc: 'Múltiplas imagens' },
  { value: 'reel', label: 'Reels', icon: Film, desc: 'Vídeo curto' },
  { value: 'stories', label: 'Stories', icon: Sparkles, desc: 'Efêmero 24h' },
] as const;

export function CreatePostDialog({ mode, onClose, onCreated, preselectedDay, onError }: Props) {
  const [caption, setCaption] = useState('');
  const [postType, setPostType] = useState('image');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSchedule, setShowSchedule] = useState(mode === 'schedule');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = preselectedDay ?? new Date().getDate();

  const scheduledAt = scheduledDate && scheduledTime
    ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
    : '';

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const isNow = mode === 'now';
  const submitLabel = isNow ? 'Postar agora' : 'Criar post';
  const loadingLabel = isNow ? 'Publicando...' : 'Criando...';

  const mutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (mediaFile) {
        const formData = new FormData();
        formData.append('file', mediaFile);
        const { data: uploadRes } = await api.post('/planner/posts/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = uploadRes.data.url;
      }
      await api.post('/planner/posts', {
        caption, postType, dayIndex: today,
        scheduledAt: scheduledAt || (isNow ? new Date().toISOString() : undefined),
        imageUrl,
      });
    },
    onSuccess: async () => {
      if (isNow) {
        try {
          const { data: pubRes } = await api.post('/planner/posts/publish-due');
          if (pubRes.data?.published > 0) {
            onCreated('Post publicado com sucesso!');
          } else {
            const reason = pubRes.data?.reason;
            if (reason === 'no_instagram_account') {
              onCreated('Post criado! Conecte o Instagram em Configurações → Integrações.');
            } else if (reason === 'no_due_posts') {
              onCreated('Post criado! Aguardando processamento.');
            } else {
              onCreated('Post criado com sucesso! Verifique a conexão com o Instagram.');
            }
          }
        } catch {
          onCreated('Post criado com sucesso! Não foi possível publicar agora.');
        }
      } else {
        onCreated('Post criado com sucesso!');
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Erro ao criar post';
      onError?.(msg);
    },
  });

  const canCreate = caption.trim() && mediaFile && !mutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h3 className="text-lg font-bold text-text-primary">{isNow ? 'Postar agora' : 'Novo post'}</h3>
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
            {mediaPreview ? (
              <div className="relative group rounded-xl overflow-hidden border border-border bg-surface-secondary">
                {mediaFile?.type.startsWith('video/') ? (
                  <video src={mediaPreview} controls className="w-full aspect-square object-cover" />
                ) : (
                  <img src={mediaPreview} alt="Preview" className="w-full aspect-square object-cover" />
                )}
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
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all',
                  dragOver
                    ? 'border-accent bg-accent/10 scale-[1.02]'
                    : 'border-border hover:border-text-tertiary bg-surface-secondary',
                )}
              >
                <Upload className="h-8 w-8 text-text-tertiary mb-2" />
                <p className="text-sm text-text-secondary font-medium">Arraste ou clique</p>
                <p className="text-xs text-text-tertiary mt-1">PNG, JPG, WebP, MP4</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
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
                      onClick={() => setPostType(opt.value)}
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
                  <p className="text-[10px] text-text-tertiary mt-1">Deixe em branco para publicar manualmente</p>
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
                onChange={e => setCaption(e.target.value)}
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
