import { useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg } from '@fullcalendar/core';
import { Plus, Trash2, CalendarClock, X, CheckCircle, XCircle } from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { CreatePostDialog } from './CreatePostDialog';
import { PostTypeDialog } from './PostTypeDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import api from '@/lib/api';
import type { Post } from '../types';
import { postToEvent, extractEventDropData, getPostFromEvent } from './calendarAdapter';

// ===== Types =====

interface CalendarPost extends Post {
  _source?: 'plan' | 'manual';
  _planTitle?: string;
}

// ===== CalendarView =====

export function CalendarView() {
  const now = new Date();
  const calendarRef = useRef<FullCalendar>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPostTypeDialog, setShowPostTypeDialog] = useState(false);
  const [createMode, setCreateMode] = useState<'schedule' | 'now'>('schedule');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [preselectedDay, setPreselectedDay] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Calcula a data range inicial (mês atual)
  const getInitialDateRange = () => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  };

  const initialRange = getInitialDateRange();
  const effectiveRange = dateRange || initialRange;

  // Query: fetch posts por date range (novo formato)
  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', effectiveRange.startDate, effectiveRange.endDate],
    queryFn: async () => {
      const { data: res } = await api.get('/planner/calendar', {
        params: { startDate: effectiveRange.startDate, endDate: effectiveRange.endDate },
      });
      return res.data as { posts: CalendarPost[] };
    },
  });

  const posts = data?.posts ?? [];

  // ===== Callbacks =====

  const handleDatesSet = useCallback((info: any) => {
    // Quando o usuário navega ou troca view, refetch com novo range
    const startDate = info.startStr; // FullCalendar formata como YYYY-MM-DD
    const endDate = info.endStr;
    setDateRange({ startDate, endDate });
    // React Query automaticamente refetch com novo queryKey
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    const post = getPostFromEvent(info.event);
    if (!post) return;

    // Toggle seleção
    if (selectedIds.has(post.id)) {
      // Se já selecionado, abre o painel
      setSelectedPost(post as CalendarPost);
    } else {
      // Se não selecionado, adiciona à seleção
      const next = new Set(selectedIds);
      next.add(post.id);
      setSelectedIds(next);
    }
  }, [selectedIds]);

  const handleEventDrop = useCallback(
    async (info: EventDropArg) => {
      const { postId, newDate } = extractEventDropData(info.event);

      try {
        // Submete o move via PATCH /planner/posts/:id/move { date }
        await api.patch(`/planner/posts/${postId}/move`, { date: newDate });

        // Sucesso: React Query refetch automático
        await queryClient.invalidateQueries({ queryKey: ['calendar'] });
        showToast('Post movido com sucesso!');
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'Erro ao mover post';
        showToast(msg, 'error');
        // Reverte a mudança visual se houver erro
        info.revert();
      }
    },
    [queryClient]
  );

  // ===== Mutations =====

  const moveMutation = useMutation({
    mutationFn: async ({ postId, date }: { postId: string; date: string }) => {
      await api.patch(`/planner/posts/${postId}/move`, { date });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao mover post';
      showToast(msg, 'error');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string | null) => {
      await api.patch('/planner/posts/bulk-schedule', {
        postIds: [...selectedIds],
        scheduledAt,
      });
    },
    onSuccess: () => {
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao agendar posts';
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
      showToast(
        count > 1 ? `${count} posts excluídos com sucesso!` : 'Post excluído com sucesso!'
      );
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Erro ao excluir post(s)';
      showToast(msg, 'error');
    },
  });

  // ===== Helpers =====

  const clearSelection = () => setSelectedIds(new Set());

  const selectAll = () => {
    if (selectedIds.size === posts.length) {
      clearSelection();
    } else {
      setSelectedIds(new Set(posts.map(p => p.id)));
    }
  };

  // ===== Events com adapter =====

  const events = posts.map(post => postToEvent(post));

  // ===== Loading / Error =====

  if (error && !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm mb-2">Erro ao carregar calendário</p>
        <p className="text-gray-500 text-xs">Verifique sua conexão</p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-64 rounded-lg bg-gray-700" />
        <div className="h-96 rounded-lg bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page-level toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300">
          <div
            className={clsx(
              'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl backdrop-blur-md',
              toast.type === 'success'
                ? 'bg-green-900/95 border border-green-600/50 text-green-200'
                : 'bg-red-900/95 border border-red-600/50 text-red-200'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {toast.message}
          </div>
        </div>
      )}

      {/* Header: actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Calendário Editorial</h1>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo post
          </button>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-600/10 border border-orange-600/30">
          <span className="text-sm text-orange-600 font-medium">{selectedIds.size} posts selecionados</span>
          <div className="flex-1" />
          <button
            onClick={() => setShowScheduleDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-600 text-sm transition-colors"
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

      {/* FullCalendar */}
      <TooltipProvider>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,title,next',
              center: '',
              right: 'dayGridMonth,timeGridWeek,listWeek',
            }}
            height="auto"
            contentHeight="auto"
            editable={true}
            eventDurationEditable={false}
            events={events}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventContent={(info) => <EventContent info={info} selectedIds={selectedIds} />}
            themeSystem="standard"
            locale="pt-br"
          />
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
          onClose={() => {
            setShowCreateDialog(false);
            setPreselectedDay(null);
          }}
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
          onClose={() => {
            setShowPostTypeDialog(false);
            setPreselectedDay(null);
          }}
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

// ===== EventContent (custom render) =====

interface EventContentProps {
  info: any;
  selectedIds: Set<string>;
}

function EventContent({ info, selectedIds }: EventContentProps) {
  const post = getPostFromEvent(info.event);
  if (!post) return <span>{info.event.title}</span>;

  const isSelected = selectedIds.has(post.id);

  return (
    <div
      className={clsx(
        'flex items-center gap-1 px-1.5 py-1 rounded text-xs truncate',
        isSelected
          ? 'bg-orange-600/80 text-white font-medium ring-1 ring-orange-500'
          : 'bg-gray-700/50 text-gray-300'
      )}
    >
      {isSelected && <CheckCircle className="h-3 w-3 shrink-0" />}
      <span className="truncate">{post.title || post.caption?.slice(0, 30) || 'Sem título'}</span>
    </div>
  );
}
