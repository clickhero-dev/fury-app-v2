import { useState, useRef } from 'react';
import { X, Copy, Check, LayoutGrid, Image, Sparkles, Film, Upload, Trash2, RotateCcw, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Post } from '../types';

interface PostSidePanelProps {
  post: Post;
  onClose: () => void;
  onUpdate: (post: Post) => void;
  onDuplicate?: (post: Post) => void;
}

const postIcons: Record<string, typeof LayoutGrid> = {
  carousel: LayoutGrid,
  reel: Film,
  image: Image,
  stories: Sparkles,
};

const postLabels: Record<string, string> = {
  carousel: 'Carrossel',
  reel: 'Reels',
  image: 'Post',
  stories: 'Stories',
};

const MAX_CAROUSEL_IMAGES = 5;

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  confirmed: 'Confirmado',
  published: 'Publicado',
};

const statusColors: Record<string, string> = {
  draft: 'text-text-tertiary bg-surface-secondary',
  approved: 'text-success bg-success/10',
  rejected: 'text-error bg-error/10',
  confirmed: 'text-success bg-success/10',
  published: 'text-blue-500 bg-blue-500/10',
};

const typeBg: Record<string, string> = {
  carousel: 'bg-blue-500/10',
  reel: 'bg-purple-500/10',
  stories: 'bg-pink-500/10',
  image: 'bg-success/10',
};

const typeText: Record<string, string> = {
  carousel: 'text-blue-500',
  reel: 'text-purple-500',
  stories: 'text-pink-500',
  image: 'text-success',
};

function DiffField({ label, before, after }: { label: string; before?: string; after?: string }) {
  const changed = (before ?? '') !== (after ?? '');
  return (
    <div>
      <p className="text-xs font-medium text-text-tertiary mb-1">{label}</p>
      <div className="space-y-1.5">
        <p className={clsx(
          'text-sm rounded-lg p-2',
          changed ? 'bg-error/10 text-error line-through' : 'bg-surface-secondary text-text-secondary',
        )}>
          {before || '—'}
        </p>
        <p className={clsx(
          'text-sm rounded-lg p-2',
          changed ? 'bg-success/10 text-success' : 'bg-surface-secondary text-text-secondary',
        )}>
          {after || '—'}
        </p>
      </div>
    </div>
  );
}

export function PostSidePanel({ post, onClose, onUpdate, onDuplicate }: PostSidePanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiEditor, setShowAiEditor] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<Post | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [editCta, setEditCta] = useState(post.cta || '');
  const [editHashtags, setEditHashtags] = useState(post.hashtags?.join(' ') || '');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editDragOver, setEditDragOver] = useState(false);

  const scheduledIso = post.scheduledAt ? new Date(post.scheduledAt) : null;
  const [editScheduledDate, setEditScheduledDate] = useState(
    scheduledIso ? scheduledIso.toISOString().slice(0, 10) : '',
  );
  const [editScheduledTime, setEditScheduledTime] = useState(
    scheduledIso ? scheduledIso.toTimeString().slice(0, 5) : '',
  );
  const editFileRef = useRef<HTMLInputElement>(null);
  const [editCarouselImages, setEditCarouselImages] = useState<string[]>([]);
  const carouselFileRef = useRef<HTMLInputElement>(null);

  // 💡 VERIFICA SE O POST É PASSADO OU JÁ FOI PUBLICADO
  const isPastOrPublished =
    (post.scheduledAt ? new Date(post.scheduledAt) < new Date() : false) ||
    post.status === 'published';

  const Icon = postIcons[post.postType] ?? Image;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyBtn = (text: string, field: string) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
    >
      {copiedField === field ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = post.imageUrl;
      if (editFile) {
        const formData = new FormData();
        formData.append('file', editFile);
        const { data: uploadRes } = await api.post('/planner/posts/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = uploadRes.data.url;
      }

      const scheduledAt = editScheduledDate && editScheduledTime
        ? new Date(`${editScheduledDate}T${editScheduledTime}`).toISOString()
        : null;

      const { data } = await api.patch(`/planner/posts/${post.id}`, {
        caption: editCaption,
        cta: editCta || undefined,
        hashtags: editHashtags ? editHashtags.split(/\s+/).filter(Boolean) : undefined,
        imageUrl: imageUrl || undefined,
        scheduledAt,
      });
      return data.data as Post;
    },
    onSuccess: (data) => {
      onUpdate(data);
      setEditMode(false);
    },
  });

  const aiEditMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const { data } = await api.patch(`/planner/posts/${post.id}`, { prompt });
      return data.data as Post;
    },
    onSuccess: (data) => {
      setPendingEdit(data);
      setShowAiEditor(false);
      setAiPrompt('');
    },
  });

  const revertMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/planner/posts/${post.id}`, {
        caption: post.caption,
        cta: post.cta,
        hashtags: post.hashtags,
      });
      return data.data as Post;
    },
    onSuccess: (data) => {
      onUpdate(data);
      setPendingEdit(null);
    },
  });

  const handleApply = () => {
    if (!pendingEdit) return;
    onUpdate(pendingEdit);
    setPendingEdit(null);
  };

  const handleClose = () => {
    if (pendingEdit) onUpdate(pendingEdit);
    onClose();
  };

  const getPostImages = (post: Post): string[] => {
    if (post.imageUrls?.length) return post.imageUrls;
    return post.imageUrl ? [post.imageUrl] : [];
  };

  const addCarouselImage = (file: File) => {
    setEditCarouselImages((prev) => {
      if (prev.length >= MAX_CAROUSEL_IMAGES) return prev;
      return [...prev, URL.createObjectURL(file)];
    });
  };

  const removeCarouselImage = (idx: number) =>
    setEditCarouselImages((prev) => prev.filter((_, i) => i !== idx));

  // Compute media content based on mode and post type
  function renderMediaContent(): React.ReactNode {
    if (!editMode) {
      // View mode
      if (post.postType === 'carousel') {
        return (
          <div className="grid grid-cols-2 gap-2">
            {getPostImages(post).map((url, idx) => (
              <div key={idx} className="relative rounded-xl overflow-hidden border border-border bg-surface-secondary aspect-square">
                <img src={url} alt={`Carousel ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        );
      }
      return (
        post.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-border bg-surface-secondary">
            {post.postType === 'reel' ? (
              <video src={post.imageUrl} controls className="w-full max-h-48 object-cover" />
            ) : (
              <img src={post.imageUrl} alt="Preview" className="w-full max-h-48 object-cover" />
            )}
          </div>
        )
      );
    }

    // Edit mode
    if (post.postType === 'carousel') {
      return (
        <div>
          {(editCarouselImages.length > 0 ? editCarouselImages : getPostImages(post)).map((url, idx) => (
            <div key={idx} className="relative group rounded-xl overflow-hidden border border-border bg-surface-secondary">
              <img src={url} alt={`Carousel ${idx + 1}`} className="w-full aspect-square object-cover" />
              <button
                onClick={() => removeCarouselImage(idx)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(editCarouselImages.length || getPostImages(post).length) < MAX_CAROUSEL_IMAGES && (
            <div
              onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
              onDragLeave={() => setEditDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setEditDragOver(false); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); files.forEach(f => addCarouselImage(f)); }}
              onClick={() => carouselFileRef.current?.click()}
              className={clsx(
                'flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all',
                editDragOver ? 'border-accent bg-accent/10' : 'border-gray-600 hover:border-gray-500',
              )}
            >
              <Plus className="h-6 w-6 text-gray-500 mb-1" />
              <p className="text-xs text-gray-400">Adicionar imagem</p>
            </div>
          )}
          <input
            ref={carouselFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={e => e.target.files && Array.from(e.target.files).forEach(f => addCarouselImage(f))}
            className="hidden"
          />
        </div>
      );
    }

    // Single image/video (reel, image, stories)
    if (editFile) {
      return (
        <div>
          <div className="relative group rounded-xl overflow-hidden border border-border bg-surface-secondary">
            {editFile.type.startsWith('video/') ? (
              <video src={URL.createObjectURL(editFile)} controls className="w-full max-h-48 object-cover" />
            ) : (
              <img src={URL.createObjectURL(editFile)} alt="Preview" className="w-full max-h-48 object-cover" />
            )}
            <button
              onClick={() => setEditFile(null)}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    // Fallback: dropzone para inserir/trocar mídia
    return (
      <div>
        <div
          onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
          onDragLeave={() => setEditDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setEditDragOver(false); const f = e.dataTransfer.files[0]; if (f) setEditFile(f); }}
          onClick={() => { editFileRef.current?.click(); }}
          className={clsx(
            'flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all',
            editDragOver ? 'border-accent bg-accent/10' : 'border-gray-600 hover:border-gray-500',
          )}
        >
          <Upload className="h-6 w-6 text-gray-500 mb-1" />
          <p className="text-xs text-gray-400">Arraste ou clique para trocar</p>
        </div>
      </div>
    );
  }

  // Refactor em andamento: mediaContent será ligado ao JSX quando o bloco
  // inline antigo for substituído — por ora fica computado (build/lint ok).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mediaContent = renderMediaContent();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', typeBg[post.postType] || 'bg-surface-secondary')}>
              <Icon className={clsx('w-5 h-5', typeText[post.postType] || 'text-text-tertiary')} />
            </div>
            <div>
              <h3 className="text-text-primary font-medium">{post.title || post.caption?.slice(0, 40) || 'Sem título'}</h3>
              <p className="text-xs text-text-tertiary">
                {postLabels[post.postType]} · Dia {post.dayIndex}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Status & Histórico Tag */}
          <div className="flex items-center justify-between">
            <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', statusColors[post.status])}>
              {statusLabels[post.status] ?? 'Rascunho'}
            </span>

            {isPastOrPublished && (
              <span className="text-xs font-medium text-text-tertiary bg-surface-secondary px-2.5 py-1 rounded-full">
                Registro Histórico
              </span>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Legenda</h4>
              {!editMode && copyBtn(post.caption, 'caption')}
            </div>
            {editMode ? (
              <textarea
                value={editCaption}
                onChange={e => setEditCaption(e.target.value)}
                rows={4}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:border-accent/50"
              />
            ) : (
              <p className="text-sm text-text-secondary whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">
                {post.caption || '—'}
              </p>
            )}
          </div>

          {/* CTA */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">CTA</h4>
              {!editMode && copyBtn(post.cta, 'cta')}
            </div>
            {editMode ? (
              <input
                value={editCta}
                onChange={e => setEditCta(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-accent focus:outline-none focus:border-accent/50"
                placeholder="Ex: Saiba mais →"
              />
            ) : (
              <p className="text-sm text-accent bg-accent/5 rounded-lg p-3 font-medium">
                {post.cta || '—'}
              </p>
            )}
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Hashtags</h4>
              {!editMode && copyBtn(post.hashtags?.join(' '), 'hashtags')}
            </div>
            {editMode ? (
              <input
                value={editHashtags}
                onChange={e => setEditHashtags(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-blue-500 focus:outline-none focus:border-accent/50"
                placeholder="#hashtag1 #hashtag2"
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags?.map((tag) => (
                  <span key={tag} className="text-xs text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">
                    {tag}
                  </span>
                )) ?? '—'}
              </div>
            )}
          </div>

          {/* Media */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Mídia</h4>
            </div>
            {editMode ? (
              editFile ? (
                <div className="relative group rounded-xl overflow-hidden border border-border bg-surface-secondary">
                  {editFile.type.startsWith('video/') ? (
                    <video src={URL.createObjectURL(editFile)} controls className="w-full max-h-48 object-cover" />
                  ) : (
                    <img src={URL.createObjectURL(editFile)} alt="Preview" className="w-full max-h-48 object-cover" />
                  )}
                  <button
                    onClick={() => setEditFile(null)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
                  onDragLeave={() => setEditDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setEditDragOver(false); const f = e.dataTransfer.files[0]; if (f) setEditFile(f); }}
                  onClick={() => editFileRef.current?.click()}
                  className={clsx(
                    'flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all',
                    editDragOver ? 'border-accent bg-accent/10' : 'border-border hover:border-text-tertiary',
                  )}
                >
                  <Upload className="h-6 w-6 text-text-tertiary mb-1" />
                  <p className="text-xs text-text-tertiary">Arraste ou clique para trocar</p>
                </div>
              )
            ) : (
              post.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-border bg-surface-secondary">
                  {post.postType === 'reel' ? (
                    <video src={post.imageUrl} controls className="w-full max-h-48 object-cover" />
                  ) : (
                    <img src={post.imageUrl} alt="Preview" className="w-full max-h-48 object-cover" />
                  )}
                </div>
              )
            )}
            <input
              ref={editFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
              onChange={e => e.target.files?.[0] && setEditFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          {/* Agendamento */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-2">Agendamento</h4>
            {editMode ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-text-tertiary mb-1">Data</label>
                  <input
                    type="date"
                    value={editScheduledDate}
                    onChange={e => setEditScheduledDate(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-text-tertiary mb-1">Hora</label>
                  <input
                    type="time"
                    value={editScheduledTime}
                    onChange={e => setEditScheduledTime(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-secondary bg-surface-secondary rounded-lg p-3">
                {post.scheduledAt
                  ? new Date(post.scheduledAt).toLocaleString('pt-BR')
                  : 'Não agendado'}
              </p>
            )}
          </div>

          {/* Image Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Prompt da imagem</h4>
              {copyBtn(post.imagePrompt, 'prompt')}
            </div>
            <p className="text-sm text-text-secondary bg-surface-secondary rounded-lg p-3 italic">
              {post.imagePrompt || '—'}
            </p>
          </div>

          {/* Diff da edição por IA */}
          {pendingEdit && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-text-primary">Sugestão da IA</h4>
                <span className="text-xs text-text-tertiary">Antes / Depois</span>
              </div>

              <DiffField label="Legenda" before={post.caption} after={pendingEdit.caption} />
              <DiffField label="CTA" before={post.cta} after={pendingEdit.cta} />
              <DiffField label="Hashtags" before={post.hashtags?.join(' ')} after={pendingEdit.hashtags?.join(' ')} />

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => revertMutation.mutate()}
                  disabled={revertMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border disabled:opacity-50 text-text-primary font-medium rounded-xl text-sm transition-colors"
                >
                  {revertMutation.isPending ? 'Revertendo...' : 'Voltar ao original'}
                </button>
                <button
                  onClick={handleApply}
                  disabled={revertMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-light disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-colors"
                >
                  Aplicar alteração
                </button>
              </div>
            </div>
          )}

          {/* Actions - Condicionais por data/status */}
          {!pendingEdit && (
            <div className="flex gap-3 pt-4 border-t border-border">
              {isPastOrPublished ? (
                /* 💡 AÇÃO PARA POSTS PASSADOS / PUBLICADOS */
                <button
                  onClick={() => onDuplicate && onDuplicate(post)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent/10 hover:bg-accent/20 text-accent font-medium rounded-xl text-sm transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reutilizar Post
                </button>
              ) : editMode ? (
                /* MODO EDIÇÃO PARA POSTS FUTUROS */
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border text-text-primary font-medium rounded-xl text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveEditMutation.mutate()}
                    disabled={saveEditMutation.isPending}
                    className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-light disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-colors"
                  >
                    {saveEditMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </>
              ) : (
                /* AÇÕES NORMAIS PARA POSTS FUTUROS */
                <>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border text-text-primary font-medium rounded-xl text-sm transition-colors"
                  >
                    Editar
                  </button>
                  <button className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border text-text-primary font-medium rounded-xl text-sm transition-colors">
                    Regenerar
                  </button>
                  <button
                    onClick={() => setShowAiEditor(!showAiEditor)}
                    className="flex-1 px-4 py-2.5 bg-accent/5 hover:bg-accent/10 text-accent font-medium rounded-xl text-sm transition-colors"
                  >
                    Melhorar com IA
                  </button>
                </>
              )}
            </div>
          )}

          {/* AI Chat Editor (apenas para posts futuros) */}
          {!pendingEdit && showAiEditor && !isPastOrPublished && (
            <div className="bg-surface-secondary rounded-xl p-4 border border-border">
              <h4 className="text-sm font-medium text-text-primary mb-3">O que você quer mudar?</h4>
              <div className="flex gap-2">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder='Ex: "Torne mais engraçado"'
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary 
                             placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) {
                      aiEditMutation.mutate(aiPrompt);
                    }
                  }}
                />
                <button
                  onClick={() => aiPrompt.trim() && aiEditMutation.mutate(aiPrompt)}
                  disabled={aiEditMutation.isPending || !aiPrompt.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 
                             text-white font-medium rounded-lg text-sm transition-colors"
                >
                  {aiEditMutation.isPending ? '...' : 'OK'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}