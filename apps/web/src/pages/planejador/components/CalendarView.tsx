import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import FullCalendar from '@fullcalendar/react';
import './CalendarView.css';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  EventClickArg,
  EventDropArg,
  DatesSetArg,
  EventContentArg,
} from '@fullcalendar/core';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import {
  Trash2,
  CalendarClock,
  X,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Globe,
  MessageCircle,
  Check,
  Share2,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
} from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { CreatePostDialog } from './CreatePostDialog';
import { PostTypeDialog } from './PostTypeDialog';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import api from '@/lib/api';
import type { Post } from '../types';
import { postToEvent, extractEventDropData, getPostFromEvent } from './calendarAdapter';

// ===== Types =====

interface CalendarPost extends Post {
  _source?: 'plan' | 'manual';
  _planTitle?: string;
}

type Channel = 'meta' | 'google' | 'whatsapp';
type Status = 'agendado' | 'publicado' | 'acao';

const views = [
  { key: 'dayGridMonth', label: 'Mês' },
  { key: 'timeGridWeek', label: 'Semana' },
  { key: 'listMonth', label: 'Agenda' },
] as const;

const channelLabels: Record<Channel, string> = {
  meta: 'Meta',
  google: 'Google Ads',
  whatsapp: 'WhatsApp',
};

const channelStyles: Record<Channel, string> = {
  meta: 'bg-[#1877F2]/12 text-[#1877F2] dark:text-[#6EA8FF]',
  google: 'bg-[#34A853]/12 text-[#1E7C3C] dark:text-[#6FD08C]',
  whatsapp: 'bg-[#25D366]/12 text-[#1B8B48] dark:text-[#5FE39A]',
};

const channelIcons: Record<Channel, React.ComponentType<{ className?: string }>> = {
  meta: Share2,
  google: Globe,
  whatsapp: MessageCircle,
};

const statusLabels: Record<Status, string> = {
  agendado: 'Agendado',
  publicado: 'Publicado',
  acao: 'Ação pendente',
};

function resolveChannel(post: Record<string, unknown>): Channel {
  const raw = String(post.channel ?? post.platform ?? '').toLowerCase();
  if (raw.includes('google') || raw.includes('ads')) return 'google';
  if (raw.includes('whats')) return 'whatsapp';
  return 'meta';
}

function resolveStatus(post: Record<string, unknown>): Status {
  const raw = String(post.status ?? '').toLowerCase();
  if (raw.includes('publi') || raw === 'published' || raw === 'posted') return 'publicado';
  if (raw.includes('schedul') || raw.includes('agend')) return 'agendado';
  if (!raw || raw.includes('draft') || raw.includes('pend') || raw.includes('review')) return 'acao';
  return 'agendado';
}

// ===== CalendarView =====

export function CalendarView() {
  const now = useMemo(() => new Date(), []);
  const calendarRef = useRef<FullCalendar | null>(null);
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
  const [title, setTitle] = useState('');
  const [currentView, setCurrentView] = useState<string>('dayGridMonth');
  const queryClient = useQueryClient();

  const api_ = () => calendarRef.current?.getApi();

  const changeView = (next: string) => {
    api_()?.changeView(next);
    setCurrentView(next);
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const getErrorMessage = (err: unknown, defaultMessage: string): string => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') {
      const axiosError = err as Record<string, unknown>;
      if (axiosError.response && typeof axiosError.response === 'object') {
        const responseData = axiosError.response as Record<string, unknown>;
        if (responseData.data && typeof responseData.data === 'object') {
          const data = responseData.data as Record<string, unknown>;
          if (typeof data.message === 'string') return data.message;
        }
      }
    }
    return defaultMessage;
  };

  // Safe useEffect com limpeza de timer
  useEffect(() => {
    if (currentView !== 'timeGridWeek') return;

    const timer = setTimeout(() => {
      const calendarApi = calendarRef.current?.getApi?.();
      if (calendarApi) {
        calendarApi.scrollToTime('06:00:00');
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [currentView]);

  const initialRange = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }, [now]);

  const effectiveRange = dateRange || initialRange;

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', effectiveRange.startDate, effectiveRange.endDate],
    queryFn: async () => {
      try {
        const { data: res } = await api.get('/planner/calendar', {
          params: { startDate: effectiveRange.startDate, endDate: effectiveRange.endDate },
        });
        return res.data as { posts: CalendarPost[] };
      } catch (err) {
        console.error('Falha na requisição da API:', err);
        return { posts: [] };
      }
    },
    retry: 1,
  });

  const posts = data?.posts ?? [];

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const extractDateOnly = (dateStr: string): string =>
      /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : dateStr.split('T')[0];

    const newStart = extractDateOnly(info.startStr);
    const newEnd = extractDateOnly(info.endStr);

    setTitle(info.view.title);

    setDateRange((prev) => {
      if (prev?.startDate === newStart && prev?.endDate === newEnd) return prev;
      return { startDate: newStart, endDate: newEnd };
    });
  }, []);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const post = getPostFromEvent(info.event);
      if (!post) return;

      // Ctrl/Cmd+Click abre o painel lateral; clique normal alterna seleção
      const isModifierClick = info.jsEvent.ctrlKey || info.jsEvent.metaKey;

      if (isModifierClick) {
        setSelectedPost(post as CalendarPost);
        return;
      }

      if (selectedIds.has(post.id)) {
        const next = new Set(selectedIds);
        next.delete(post.id);
        setSelectedIds(next);
      } else {
        const next = new Set(selectedIds);
        next.add(post.id);
        setSelectedIds(next);
      }
    },
    [selectedIds],
  );

  const handleDateClick = useCallback((info: { dateStr: string }) => {
    const clickedDate = new Date(info.dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    clickedDate.setHours(0, 0, 0, 0);
    if (clickedDate < today) return;

    setPreselectedDay(clickedDate.getDate());
    setCreateMode('schedule');
    setShowPostTypeDialog(true);
  }, []);

  const handleEventDrop = useCallback(
    async (info: EventDropArg) => {
      const { postId, newDate, scheduledAt } = extractEventDropData(info.event);

      if (!newDate) {
        info.revert();
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      if (newDate < today) {
        showToast('Não é possível mover posts para datas passadas.', 'error');
        info.revert();
        return;
      }

      const timePart = info.event.start
        ? info.event.start.toTimeString().split(' ')[0]
        : '00:00:00';

      try {
        await api.patch(`/planner/posts/${postId}/move`, {
          date: newDate,
          time: timePart,
          scheduledAt: scheduledAt,
        });

        await queryClient.invalidateQueries({ queryKey: ['calendar'] });
        showToast('Post movido com sucesso!');
      } catch (err) {
        showToast(getErrorMessage(err, 'Erro ao mover post'), 'error');
        info.revert();
      }
    },
    [queryClient],
  );

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledAt: string | null) => {
      await api.patch('/planner/posts/bulk-schedule', {
        postIds: [...selectedIds],
        scheduledAt,
      });
    },
    onSuccess: () => {
      clearSelection();
      setShowScheduleDialog(false);
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err) => showToast(getErrorMessage(err, 'Erro ao agendar posts'), 'error'),
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
    onError: (err) => showToast(getErrorMessage(err, 'Erro ao excluir post(s)'), 'error'),
  });

  const clearSelection = () => setSelectedIds(new Set());

  const selectAll = () => {
    if (selectedIds.size === posts.length) clearSelection();
    else setSelectedIds(new Set(posts.map((p) => p.id)));
  };

  const events = useMemo(() => posts.map((post) => postToEvent(post)), [posts]);

  const legend = [
    { label: 'Agendado / Publicado', className: 'bg-brand' },
    { label: 'Ação pendente', className: 'bg-accent' },
  ];

  if (error && !data) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
        <div>
          <p className="text-base font-semibold text-text-primary">Erro ao carregar calendário</p>
          <p className="mt-1 text-sm text-text-secondary">Verifique sua conexão ou dados de login.</p>
        </div>
      </div>
    );
  }

  if (isLoading && !data && !dateRange) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-lg sm:p-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface-secondary/60" />
        <div className="mt-4 h-[520px] animate-pulse rounded-xl bg-surface-secondary/60" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <section className="ady-calendar-shell rounded-2xl border border-border bg-surface p-4 shadow-lg sm:p-6">
        {toast && (
          <div className="fixed right-6 top-6 z-50">
            <div
              className={clsx(
                'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm shadow-lg',
                toast.type === 'success'
                  ? 'border-brand/30 bg-surface text-text-primary'
                  : 'border-error/40 bg-surface text-error',
              )}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="size-4 text-brand" />
              ) : (
                <XCircle className="size-4" />
              )}
              {toast.message}
            </div>
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border">
              <button
                aria-label="Mês anterior"
                onClick={() => api_()?.prev()}
                className="cursor-pointer rounded-l-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                aria-label="Próximo mês"
                onClick={() => api_()?.next()}
                className="cursor-pointer rounded-r-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <button
              onClick={() => api_()?.today()}
              className="cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Hoje
            </button>

            <h2 className="ml-1 text-lg font-semibold tracking-tight first-letter:uppercase sm:text-xl">
              {title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {posts.length > 0 && (
              <button
                onClick={selectAll}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {selectedIds.size === posts.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            )}
            <div className="flex rounded-lg border border-border p-0.5">
              {views.map((v) => (
                <button
                  key={v.key}
                  onClick={() => changeView(v.key)}
                  className={clsx(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    currentView === v.key
                      ? 'bg-brand text-white'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Button
  variant="spark"
  size="sm"
  className="text-slate-900 dark:text-white hover:text-slate-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
  onClick={() => {
    setPreselectedDay(null);
    setCreateMode('schedule');
    setShowPostTypeDialog(true);
  }}
>
  <Plus className="size-4" /> Novo Post / Campanha
</Button>
          </div>
        </header>

        <div className="mt-4 flex h-10 items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-4">
            {legend.map((l) => (
              <span
                key={l.label}
                className="flex items-center gap-1.5 text-[11px] text-text-secondary"
              >
                <span className={clsx('size-2 rounded-full', l.className)} />
                {l.label}
              </span>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-secondary/80 px-2.5 py-1">
              <span className="mr-1 text-xs font-medium text-text-secondary">
                {selectedIds.size} {selectedIds.size > 1 ? 'posts selecionados' : 'post selecionado'}
              </span>

              <Button variant="spark" size="sm" onClick={() => setShowScheduleDialog(true)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
                <CalendarClock className="size-3.5" /> Agendar
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={scheduleMutation.isPending}
                onClick={() => scheduleMutation.mutate(null)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Desprogramar
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="border-error/20 bg-error/10 text-error hover:bg-error/20 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="size-3.5" /> Excluir
              </Button>

              <button
                aria-label="Limpar seleção"
                onClick={clearSelection}
                className="ml-1 cursor-pointer rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>

        <div className="ady-calendar mt-3">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            height={currentView === 'dayGridMonth' ? 'auto' : '770px'}
            expandRows={false}
            scrollTime="6:00:00"
            locale={ptBrLocale}
            firstDay={0}
            headerToolbar={false}
            dayMaxEvents={3}
            editable
            droppable
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            eventAllow={(dropInfo) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return dropInfo.start >= today;
            }}
            eventDurationEditable={false}
            nowIndicator
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            allDaySlot={false}
            events={events}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            dateClick={handleDateClick}
            eventContent={(info: EventContentArg) => (
              <EventCard
                arg={info}
                selectedIds={selectedIds}
                showToast={showToast}
                queryClient={queryClient}
                getErrorMessage={getErrorMessage}
              />
            )}
            themeSystem="standard"
            noEventsText="Nenhuma publicação agendada"
          />
        </div>

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
      </section>
    </TooltipProvider>
  );
}

function EventCard({
  arg,
  selectedIds,
  showToast,
  queryClient,
  getErrorMessage,
}: {
  arg: EventContentArg;
  selectedIds: Set<string>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  queryClient: ReturnType<typeof useQueryClient>;
  getErrorMessage: (err: unknown, defaultMessage: string) => string;
}) {
  const post = getPostFromEvent(arg.event) as (CalendarPost & Record<string, unknown>) | null;
  const channel = resolveChannel((post ?? {}) as Record<string, unknown>);
  const status = resolveStatus((post ?? {}) as Record<string, unknown>);
  const tone = status === 'acao' ? 'accent' : 'brand';
  const isList = arg.view.type.startsWith('list');
  const isSelected = post ? selectedIds.has(post.id) : false;
  const ChannelIcon = channelIcons[channel];

  const eventDate = arg.event.start ? new Date(arg.event.start) : null;
  const isPast = eventDate ? eventDate < new Date() : false;

  const title =
    arg.event.title || post?.title || (post?.caption ? String(post.caption).slice(0, 40) : 'Sem título');

  // Keyboard-accessible move actions
  const movePost = useCallback(async (direction: 'prev' | 'next') => {
    if (!post) return;
    const currentDate = new Date(post.date);
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction === 'prev' ? -1 : 1));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) {
      showToast('Não é possível mover posts para datas passadas.', 'error');
      return;
    }

    const newDateStr = newDate.toISOString().split('T')[0];
    const timePart = post.scheduledAt 
      ? new Date(post.scheduledAt).toTimeString().split(' ')[0]
      : '00:00:00';

    try {
      await api.patch(`/planner/posts/${post.id}/move`, {
        date: newDateStr,
        time: timePart,
        scheduledAt: post.scheduledAt,
      });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      showToast(`Post movido para ${newDate.toLocaleDateString('pt-BR')}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Erro ao mover post'), 'error');
    }
  }, [post, queryClient]);

  return (
    <div
      className={clsx(
        'group w-full overflow-hidden rounded-lg border-l-[3px] bg-surface px-2 py-1.5 text-left transition-all duration-200',
        isList ? 'border border-l-[3px] border-border' : 'shadow-sm',
        tone === 'brand' ? 'border-l-brand' : 'border-l-accent',
        isSelected && 'ring-1 ring-brand',
        isPast
          ? 'opacity-60 grayscale-[25%] hover:opacity-85'
          : 'hover:-translate-y-px hover:shadow-lg',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none',
            channelStyles[channel],
          )}
        >
          <ChannelIcon className="size-3" />
          {channelLabels[channel]}
        </span>
        {arg.timeText ? (
          <span className="text-[10px] font-medium text-text-secondary">{arg.timeText}</span>
        ) : null}
        {/* Keyboard-accessible move menu */}
        {!isPast && (
          <div className="relative ml-auto">
            <button
              type="button"
              aria-label="Opções de movimentação"
              className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition-colors"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-border bg-surface shadow-lg min-w-[140px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
              <button
                type="button"
                onClick={() => movePost('prev')}
                disabled={!post}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:bg-surface-secondary"
              >
                <ArrowUp className="size-4" />
                Mover para dia anterior
              </button>
              <hr className="border-border my-1" />
              <button
                type="button"
                onClick={() => movePost('next')}
                disabled={!post}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-secondary focus-visible:outline-none focus-visible:bg-surface-secondary"
              >
                <ArrowDown className="size-4" />
                Mover para próximo dia
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-text-primary">
        {isSelected && <Check className="size-3 shrink-0 text-brand" />}
        {title}
      </p>

      <div className="mt-1 flex items-center justify-between gap-1">
        <span
          className={clsx(
            'text-[10px] font-medium',
            tone === 'brand' ? 'text-brand' : 'text-accent',
          )}
        >
          {statusLabels[status]}
        </span>

        {isPast && (
          <span className="text-[9px] font-normal text-text-tertiary">
            Concluído
          </span>
        )}
      </div>
    </div>
  );
}