import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  LayoutGrid, Image, Sparkles, Film,
  ChevronLeft, ChevronRight, Plus, Trash2, CalendarClock, X, Upload,
} from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import api from '@/lib/api';
import type { Post } from '../types';

// ===== Types =====

interface CalendarPost extends Post {
  _source?: 'plan' | 'manual';
  _planTitle?: string;
}

interface CalendarData {
  posts: CalendarPost[];
  year: number;
  month: number;
}

// ===== Constants =====

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TYPE_ICONS: Record<string, typeof Image> = {
  carousel: LayoutGrid, reel: Film, image: Image, stories: Sparkles,
};
const TYPE_LABELS: Record<string, string> = {
  carousel: 'Carrossel', reel: 'Reels', image: 'Post', stories: 'Stories',
};
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ===== CalendarView =====

export function CalendarView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [dragPostId, setDragPostId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const { data: res } = await api.get('/planner/calendar', { params: { year, month } });
      return res.data as CalendarData;
    },
  });

  const posts = data?.posts ?? [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getDayOfWeek(year, month, 1);

  // Group posts by day
  const postsByDay = useMemo(() => {
    const map = new Map<number, CalendarPost[]>();
    posts.forEach(p => {
      const arr = map.get(p.dayIndex) || [];
      arr.push(p);
      map.set(p.dayIndex, arr);
    });
    return map;
  }, [posts]);

  // ===== Navigation =====

  const goPrevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedIds(new Set());
  };
  const goNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedIds(new Set());
  };

  // ===== Selection =====

  const toggleDay = (day: number) => {
    const dayPosts = postsByDay.get(day) || [];
    if (dayPosts.length === 0) return;
    const dayIds = new Set(dayPosts.map(p => p.id));
    const allSelected = dayPosts.every(p => selectedIds.has(p.id));
    const next = new Set(selectedIds);
    if (allSelected) dayIds.forEach(id => next.delete(id));
    else dayIds.forEach(id => next.add(id));
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === posts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(posts.map(p => p.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ===== Mutations =====

  const moveMutation = useMutation({
    mutationFn: async ({ postId, dayIndex }: { postId: string; dayIndex: number }) => {
      await api.patch(`/planner/posts/${postId}/move`, { dayIndex });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string | null) => {
      await api.patch('/planner/posts/bulk-schedule', {
        postIds: [...selectedIds], scheduledAt,
      });
    },
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/planner/posts/bulk', { data: { postIds: [...selectedIds] } });
    },
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
  });

  // ===== DnD =====

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    e.dataTransfer.setData('text/plain', postId);
    e.dataTransfer.effectAllowed = 'move';
    setDragPostId(postId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    const postId = e.dataTransfer.getData('text/plain');
    if (postId) moveMutation.mutate({ postId, dayIndex });
    setDragPostId(null);
  };

  const handleDragEnd = () => setDragPostId(null);

  // ===== Loading / Error / Empty =====

  if (isLoading) return <CalendarSkeleton />;
  if (error && !data) return <CalendarError />;

  // ===== Grid =====

  const grid: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) grid.push(<div key={`empty-${i}`} />);

  for (let day = 1; day <= daysInMonth; day++) {
    const dayPosts = postsByDay.get(day) || [];
    const allDaySelected = dayPosts.length > 0 && dayPosts.every(p => selectedIds.has(p.id));
    const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate();

    grid.push(
      <div
        key={day}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, day)}
        className={clsx(
          'relative min-h-[80px] rounded-lg border p-1.5 transition-colors',
          isToday ? 'border-accent/50 bg-accent/5' : 'border-gray-700/50',
          dayPosts.length > 0 ? 'bg-gray-800/60' : 'bg-transparent',
          dragPostId && 'border-dashed border-accent/30',
        )}
      >
        {/* Day number + checkbox */}
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx('text-xs', isToday ? 'text-accent font-bold' : 'text-gray-500')}>
            {day}
          </span>
          {dayPosts.length > 0 && (
            <input
              type="checkbox"
              checked={allDaySelected}
              onChange={() => toggleDay(day)}
              className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 accent-accent cursor-pointer"
            />
          )}
        </div>

        {/* Posts */}
        {dayPosts.slice(0, 3).map(post => {
          const Icon = TYPE_ICONS[post.postType] || Image;
          return (
            <div
              key={post.id}
              draggable
              onDragStart={(e) => handleDragStart(e, post.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => { e.stopPropagation(); setSelectedPost(post); }}
              className={clsx(
                'flex items-center gap-1 mt-1 px-1 py-0.5 rounded cursor-pointer text-[10px] transition-colors',
                selectedIds.has(post.id) ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-gray-700/50',
                dragPostId === post.id && 'opacity-50',
              )}
            >
              <Icon className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="text-gray-400 truncate">{post.title || post.caption?.slice(0, 20) || 'Sem título'}</span>
              {post._source === 'manual' && <span className="text-[8px] text-accent ml-auto">+</span>}
            </div>
          );
        })}
        {dayPosts.length > 3 && (
          <span className="text-[10px] text-gray-500 px-1">+{dayPosts.length - 3}</span>
        )}
      </div>,
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: month nav + add post */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-white min-w-[180px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {posts.length > 0 && (
            <button
              onClick={selectAll}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {selectedIds.size === posts.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          )}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo post
          </button>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/30">
          <span className="text-sm text-accent font-medium">{selectedIds.size} posts selecionados</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowScheduleDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent text-sm transition-colors"
          >
            <CalendarClock className="h-4 w-4" /> Agendar
          </button>
          <button
            onClick={() => scheduleMutation.mutate(null)}
            disabled={scheduleMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            Desprogramar
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 text-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Calendar grid */}
      <TooltipProvider>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
          ))}
          {grid}
        </div>
      </TooltipProvider>

      {/* Post side panel */}
      {selectedPost && (
        <PostSidePanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={(updated) => setSelectedPost(updated as CalendarPost)}
        />
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <CreatePostDialog
          year={year} month={month}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => { setShowCreateDialog(false); queryClient.invalidateQueries({ queryKey: ['calendar'] }); }}
        />
      )}
      {showScheduleDialog && (
        <ScheduleDialog
          count={selectedIds.size}
          onConfirm={(scheduledAt) => scheduleMutation.mutate(scheduledAt)}
          onClose={() => setShowScheduleDialog(false)}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          count={selectedIds.size}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowDeleteConfirm(false)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ===== Dialogs =====

function ScheduleDialog({ count, onConfirm, onClose }: {
  count: number; onConfirm: (s: string) => void; onClose: () => void;
}) {
  const [dateTime, setDateTime] = useState('');
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-2">Agendar {count} post{count > 1 ? 's' : ''}</h3>
        <input
          type="datetime-local"
          value={dateTime}
          onChange={e => setDateTime(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-4"
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">Cancelar</button>
          <button
            onClick={() => dateTime && onConfirm(new Date(dateTime).toISOString())}
            disabled={!dateTime}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-50 text-white text-sm"
          >
            Confirmar
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function DeleteConfirmDialog({ count, onConfirm, onClose, loading }: {
  count: number; onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-2">Excluir {count} post{count > 1 ? 's' : ''}?</h3>
        <p className="text-sm text-gray-400 mb-4">Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm"
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </DialogOverlay>
  );
}

function CreatePostDialog({ year, month, onClose, onCreated }: {
  year: number; month: number; onClose: () => void; onCreated: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [postType, setPostType] = useState('image');
  const [dayIndex, setDayIndex] = useState(1);
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const daysInMonth = getDaysInMonth(year, month);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (mediaFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', mediaFile);
        const { data: uploadRes } = await api.post('/planner/posts/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = uploadRes.data.url;
        setUploading(false);
      }
      await api.post('/planner/posts', {
        caption, postType, dayIndex,
        scheduledAt: scheduledAt || undefined,
        imageUrl,
      });
    },
    onSuccess: onCreated,
  });

  const TYPE_OPTIONS = [
    { value: 'image', label: 'Post', icon: Image, desc: 'Imagem única' },
    { value: 'carousel', label: 'Carrossel', icon: LayoutGrid, desc: 'Múltiplas imagens' },
    { value: 'reel', label: 'Reels', icon: Film, desc: 'Vídeo curto' },
    { value: 'stories', label: 'Stories', icon: Sparkles, desc: 'Efêmero 24h' },
  ] as const;

  const canCreate = caption.trim() && mediaFile && !mutation.isPending;

  return (
    <DialogOverlay onClose={onClose}>
      <div
        className="bg-gray-900 border border-gray-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h3 className="text-lg font-bold text-white">Novo post</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: media upload */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Mídia <span className="text-red-400">*</span>
            </label>
            {mediaPreview ? (
              <div className="relative group rounded-xl overflow-hidden border border-gray-700/50 bg-gray-800">
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
                  <p className="text-[10px] text-gray-300">{(mediaFile!.size / 1024 / 1024).toFixed(1)} MB</p>
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
                    : 'border-gray-600 hover:border-gray-500 bg-gray-800/40',
                )}
              >
                <Upload className="h-8 w-8 text-gray-500 mb-2" />
                <p className="text-sm text-gray-400 font-medium">Arraste ou clique</p>
                <p className="text-xs text-gray-600 mt-1">PNG, JPG, WebP, MP4</p>
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
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Tipo</label>
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
                          : 'border-gray-700/50 hover:border-gray-600 text-gray-400 hover:text-gray-300',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day + Schedule */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Dia</label>
                <select
                  value={dayIndex}
                  onChange={e => setDayIndex(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-accent focus:outline-none transition-colors"
                >
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Agendar</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:border-accent focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Legenda <span className="text-red-400">*</span>
              </label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:border-accent focus:outline-none transition-colors"
                placeholder="Escreva a legenda do post..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!canCreate}
                className={clsx(
                  'flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all',
                  canCreate
                    ? 'bg-accent hover:bg-accent-light active:scale-[0.98]'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                )}
              >
                {uploading ? 'Enviando mídia...' : mutation.isPending ? 'Criando...' : 'Criar post'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

// ===== Shared overlay =====

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      {children}
    </div>
  );
}

// ===== Skeleton / Error =====

function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-gray-800/40" />
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map(d => <div key={d} className="text-center text-xs text-gray-500 py-2">{d}</div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[80px] rounded-lg border border-gray-700/50 bg-gray-800/30" />
        ))}
      </div>
    </div>
  );
}

function CalendarError() {
  return (
    <div className="text-center py-12">
      <p className="text-red-400 text-sm mb-2">Erro ao carregar calendário</p>
      <p className="text-gray-500 text-xs">Verifique sua conexão</p>
    </div>
  );
}
