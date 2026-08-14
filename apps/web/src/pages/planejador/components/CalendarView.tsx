<<<<<<< HEAD
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  LayoutGrid, Image, Sparkles, Film,
  ChevronLeft, ChevronRight, Plus, Trash2, CalendarClock, X,
} from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
=======
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  LayoutGrid, Image, Sparkles, Film, CheckCircle, XCircle,
  ChevronLeft, ChevronRight, Plus, Trash2, CalendarClock, X,
} from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { CreatePostDialog } from './CreatePostDialog';
import { PostTypeDialog } from './PostTypeDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
>>>>>>> origin/hmg
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
<<<<<<< HEAD
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
=======
  const [showPostTypeDialog, setShowPostTypeDialog] = useState(false);
  const [createMode, setCreateMode] = useState<'schedule' | 'now'>('schedule');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const [preselectedDay, setPreselectedDay] = useState<number | null>(null);
>>>>>>> origin/hmg
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

<<<<<<< HEAD
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

=======
>>>>>>> origin/hmg
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
<<<<<<< HEAD
=======
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao mover post. Tente novamente.';
      showToast(msg, 'error');
    },
>>>>>>> origin/hmg
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string | null) => {
      await api.patch('/planner/posts/bulk-schedule', {
        postIds: [...selectedIds], scheduledAt,
      });
    },
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
<<<<<<< HEAD
=======
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao agendar posts. Tente novamente.';
      showToast(msg, 'error');
    },
>>>>>>> origin/hmg
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/planner/posts/bulk', { data: { postIds: [...selectedIds] } });
    },
<<<<<<< HEAD
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
=======
    onSuccess: () => {
      const count = selectedIds.size;
      clearSelection();
      setShowDeleteConfirm(false);
      showToast(count > 1 ? `${count} posts excluídos com sucesso!` : 'Post excluído com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao excluir post(s). Tente novamente.';
      showToast(msg, 'error');
    },
>>>>>>> origin/hmg
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
<<<<<<< HEAD
    const allDaySelected = dayPosts.length > 0 && dayPosts.every(p => selectedIds.has(p.id));
=======
>>>>>>> origin/hmg
    const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate();

    grid.push(
      <div
        key={day}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, day)}
<<<<<<< HEAD
        className={clsx(
          'relative min-h-[80px] rounded-lg border p-1.5 transition-colors',
          isToday ? 'border-accent/50 bg-accent/5' : 'border-gray-700/50',
          dayPosts.length > 0 ? 'bg-gray-800/60' : 'bg-transparent',
          dragPostId && 'border-dashed border-accent/30',
        )}
      >
        {/* Day number + checkbox */}
=======
        onClick={() => {
          if (dayPosts.length === 0) {
            setPreselectedDay(day);
            setShowPostTypeDialog(true);
          }
        }}
        className={clsx(
          'relative min-h-[80px] rounded-lg border p-1.5 transition-colors',
          isToday ? 'border-accent/50 bg-accent/5' : 'border-gray-700/50',
          dayPosts.length > 0 ? 'bg-gray-800/60' : 'bg-transparent hover:bg-gray-800/30 cursor-pointer',
          dragPostId && 'border-dashed border-accent/30',
        )}
      >
        {/* Day number */}
>>>>>>> origin/hmg
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx('text-xs', isToday ? 'text-accent font-bold' : 'text-gray-500')}>
            {day}
          </span>
<<<<<<< HEAD
          {dayPosts.length > 0 && (
            <input
              type="checkbox"
              checked={allDaySelected}
              onChange={() => toggleDay(day)}
              className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 accent-accent cursor-pointer"
            />
          )}
=======
>>>>>>> origin/hmg
        </div>

        {/* Posts */}
        {dayPosts.slice(0, 3).map(post => {
          const Icon = TYPE_ICONS[post.postType] || Image;
          const isSelected = selectedIds.has(post.id);
          return (
            <div
              key={post.id}
              draggable
              onDragStart={(e) => handleDragStart(e, post.id)}
              onDragEnd={handleDragEnd}
<<<<<<< HEAD
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
=======
              onClick={(e) => {
                e.stopPropagation();
                // ponytail: toggle selection on click; click selected post again to view
                if (isSelected) {
                  setSelectedPost(post);
                } else {
                  const next = new Set(selectedIds);
                  next.add(post.id);
                  setSelectedIds(next);
                }
              }}
              className={clsx(
                'flex items-center gap-1 mt-1 px-1.5 py-1 rounded cursor-pointer text-[10px] transition-all',
                isSelected
                  ? 'bg-accent/30 ring-1 ring-accent shadow-[0_0_8px_rgba(234,88,12,0.2)]'
                  : 'hover:bg-gray-700/50',
                dragPostId === post.id && 'opacity-50',
              )}
            >
              <Icon className={clsx('h-3 w-3 shrink-0', isSelected ? 'text-accent' : 'text-gray-400')} />
              <span className={clsx('truncate', isSelected ? 'text-accent font-medium' : 'text-gray-400')}>
                {post.title || post.caption?.slice(0, 20) || 'Sem título'}
              </span>
              {isSelected && <CheckCircle className="h-3 w-3 text-accent ml-auto shrink-0" />}
              {!isSelected && post._source === 'manual' && <span className="text-[8px] text-accent ml-auto">+</span>}
>>>>>>> origin/hmg
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
<<<<<<< HEAD
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
=======
      {/* Page-level toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
          <div className={clsx(
            'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-md',
            toast.type === 'success' ? 'bg-green-900/95 border border-green-600/50 text-green-200' : 'bg-red-900/95 border border-red-600/50 text-red-200',
          )}>
            {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toast.message}
          </div>
>>>>>>> origin/hmg
        </div>
      </div>

<<<<<<< HEAD
=======
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
            onClick={() => setShowPostTypeDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo post
          </button>
        </div>
      </div>

>>>>>>> origin/hmg
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
<<<<<<< HEAD
          onUpdate={(updated) => setSelectedPost(updated as CalendarPost)}
=======
          onUpdate={(updated) => {
            setSelectedPost(updated as CalendarPost);
            showToast('Post atualizado!');
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }}
>>>>>>> origin/hmg
        />
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <CreatePostDialog
<<<<<<< HEAD
          year={year} month={month}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => { setShowCreateDialog(false); queryClient.invalidateQueries({ queryKey: ['calendar'] }); }}
=======
          mode={createMode}
          preselectedDay={preselectedDay}
          onClose={() => { setShowCreateDialog(false); setPreselectedDay(null); }}
          onCreated={(message) => {
            setShowCreateDialog(false);
            setPreselectedDay(null);
            showToast(message);
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
      {showPostTypeDialog && (
        <PostTypeDialog
          onSelect={(mode) => {
            setShowPostTypeDialog(false);
            setCreateMode(mode);
            setShowCreateDialog(true);
          }}
          onClose={() => { setShowPostTypeDialog(false); setPreselectedDay(null); }}
>>>>>>> origin/hmg
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

<<<<<<< HEAD
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

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/planner/posts', {
        caption, postType, dayIndex,
        scheduledAt: scheduledAt || undefined,
      });
    },
    onSuccess: onCreated,
  });

  const daysInMonth = getDaysInMonth(year, month);

  return (
    <DialogOverlay onClose={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white mb-4">Novo post</h3>

        <label className="block text-sm text-gray-400 mb-1">Legenda</label>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-3 resize-none"
          placeholder="Escreva a legenda do post..."
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Tipo</label>
            <select
              value={postType}
              onChange={e => setPostType(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="image">Post</option>
              <option value="carousel">Carrossel</option>
              <option value="reel">Reels</option>
              <option value="stories">Stories</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Dia do mês</label>
            <select
              value={dayIndex}
              onChange={e => setDayIndex(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Dia {d}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="block text-sm text-gray-400 mb-1">Agendar (opcional)</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-4"
        />

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !caption.trim()}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-light disabled:opacity-50 text-white text-sm"
          >
            {mutation.isPending ? 'Criando...' : 'Criar post'}
          </button>
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

=======
>>>>>>> origin/hmg
// ===== Skeleton / Error =====

function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
<<<<<<< HEAD
      <div className="h-10 w-64 rounded-lg bg-gray-800/40" />
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map(d => <div key={d} className="text-center text-xs text-gray-500 py-2">{d}</div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[80px] rounded-lg border border-gray-700/50 bg-gray-800/30" />
=======
      <div className="h-10 w-64 rounded-lg bg-surface-secondary" />
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map(d => <div key={d} className="text-center text-xs text-text-tertiary py-2">{d}</div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[80px] rounded-lg border border-border bg-surface-secondary/60" />
>>>>>>> origin/hmg
        ))}
      </div>
    </div>
  );
}

function CalendarError() {
  return (
    <div className="text-center py-12">
<<<<<<< HEAD
      <p className="text-red-400 text-sm mb-2">Erro ao carregar calendário</p>
      <p className="text-gray-500 text-xs">Verifique sua conexão</p>
=======
      <p className="text-error text-sm mb-2">Erro ao carregar calendário</p>
      <p className="text-text-tertiary text-xs">Verifique sua conexão</p>
>>>>>>> origin/hmg
    </div>
  );
}
