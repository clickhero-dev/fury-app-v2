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
import api from '@/lib/api';
import type { Post } from '../types';

// ===== Types =====

interface CalendarPost extends Post {
  _source?: 'plan' | 'manual';
  _planTitle?: string;
  imageUrl?: string | null;
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
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao mover post. Tente novamente.';
      showToast(msg, 'error');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string | null) => {
      await api.patch('/planner/posts/bulk-schedule', {
        postIds: [...selectedIds], scheduledAt,
      });
    },
    onSuccess: () => { clearSelection(); queryClient.invalidateQueries({ queryKey: ['calendar'] }); },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao agendar posts. Tente novamente.';
      showToast(msg, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/planner/posts/bulk', { data: { postIds: [...selectedIds] } });
    },
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
    const isToday = year === now.getFullYear() && month === now.getMonth() + 1 && day === now.getDate();

    grid.push(
      <div
        key={day}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, day)}
        onClick={() => {
          if (dayPosts.length === 0) {
            setPreselectedDay(day);
            setShowPostTypeDialog(true);
          }
        }}
        className={clsx(
          'relative min-h-[80px] rounded-lg border p-1.5 transition-colors',
          isToday ? 'border-accent/50 bg-accent/5' : 'border-border',
          dayPosts.length > 0 ? 'bg-surface-secondary/60' : 'bg-transparent hover:bg-surface-secondary/30 cursor-pointer',
          dragPostId && 'border-dashed border-accent/30',
        )}
      >
        {/* Day number */}
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx('text-xs', isToday ? 'text-accent font-bold' : 'text-text-tertiary')}>
            {day}
          </span>
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
                'flex items-center gap-1.5 mt-1 px-1.5 py-1 rounded cursor-pointer text-[10px] transition-all',
                isSelected
                  ? 'bg-accent/30 ring-1 ring-accent shadow-[0_0_8px_rgba(234,88,12,0.2)]'
                  : 'hover:bg-surface-secondary',
                dragPostId === post.id && 'opacity-50',
              )}
            >
              {post.imageUrl ? (
                <img
                  src={post.imageUrl}
                  alt=""
                  className={clsx('h-6 w-6 rounded object-cover shrink-0', isSelected && 'ring-1 ring-accent')}
                />
              ) : (
                <Icon className={clsx('h-3 w-3 shrink-0', isSelected ? 'text-accent' : 'text-text-tertiary')} />
              )}
              <span className={clsx('truncate', isSelected ? 'text-accent font-medium' : 'text-text-secondary')}>
                {post.title || post.caption?.slice(0, 20) || 'Sem título'}
              </span>
              {isSelected && <CheckCircle className="h-3 w-3 text-accent ml-auto shrink-0" />}
              {!isSelected && post._source === 'manual' && <span className="text-[8px] text-accent ml-auto">+</span>}
            </div>
          );
        })}
        {dayPosts.length > 3 && (
          <span className="text-[10px] text-text-tertiary px-1">+{dayPosts.length - 3}</span>
        )}
      </div>,
    );
  }

  return (
    <div className="space-y-4">
      {/* Page-level toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
          <div className={clsx(
            'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-md border',
            toast.type === 'success'
              ? 'bg-success/95 border-success/30 text-white'
              : 'bg-error/95 border-error/30 text-white',
          )}>
            {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {toast.message}
          </div>
        </div>
      )}

      {/* Header: month nav + add post */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-text-primary min-w-[180px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {posts.length > 0 && (
            <button
              onClick={selectAll}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface-secondary text-text-secondary text-sm transition-colors"
          >
            Desprogramar
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-error/10 hover:bg-error/20 text-error text-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Calendar grid */}
      <TooltipProvider>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-text-tertiary py-2">{d}</div>
          ))}
          {grid}
        </div>
      </TooltipProvider>

      {/* Post side panel */}
      {selectedPost && (
        <PostSidePanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={(updated) => {
            setSelectedPost(updated as CalendarPost);
            showToast('Post atualizado!');
            queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }}
        />
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <CreatePostDialog
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

// ===== Skeleton / Error =====

function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-surface-secondary" />
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map(d => <div key={d} className="text-center text-xs text-text-tertiary py-2">{d}</div>)}
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="min-h-[80px] rounded-lg border border-border bg-surface-secondary/60" />
        ))}
      </div>
    </div>
  );
}

function CalendarError() {
  return (
    <div className="text-center py-12">
      <p className="text-error text-sm mb-2">Erro ao carregar calendário</p>
      <p className="text-text-tertiary text-xs">Verifique sua conexão</p>
    </div>
  );
}
