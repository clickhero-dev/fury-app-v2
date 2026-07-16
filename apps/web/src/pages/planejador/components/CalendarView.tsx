import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { LayoutGrid, Image, Sparkles } from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import type { Post } from '../types';

interface CalendarViewProps {
  plan: {
    id: string;
    title: string;
    objective: string;
    totalPosts: number;
    posts: Post[];
  };
  onScheduleAll?: () => void;
}

const postIcons: Record<string, typeof LayoutGrid> = {
  carousel: LayoutGrid,
  image: Image,
  stories: Sparkles,
};

const postColors: Record<string, string> = {
  carousel: 'border-l-blue-500',
  image: 'border-l-success',
  stories: 'border-l-pink-500',
};

const statusColors: Record<string, string> = {
  draft: 'bg-surface-secondary text-text-tertiary',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-red-50 text-red-600',
  published: 'bg-blue-50 text-blue-600',
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
// ponytail: FIRST_DOW dinâmico, não hardcoded — não quebra em outro mês
const FIRST_DOW = new Date(2026, 6, 1).getDay();
const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarView({ plan, onScheduleAll }: CalendarViewProps) {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const postsByDay = useMemo(() => {
    const map: Record<number, Post[]> = {};
    for (const post of plan.posts) {
      const day = post.dayIndex;
      if (!map[day]) map[day] = [];
      map[day].push(post);
    }
    return map;
  }, [plan.posts]);

  const totalApproved = plan.posts.filter((p) => p.status === 'approved').length;

  return (
    <div className="flex flex-col min-h-0">
      {/* ApprovalBar */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{plan.title}</h2>
            <p className="text-sm text-text-tertiary">
              <span className="text-success font-medium">{totalApproved}</span> de {plan.totalPosts} aprovados
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-tertiary">
              {plan.totalPosts} conteúdos
            </span>
            <button
              onClick={onScheduleAll}
              className="px-6 py-2.5 bg-accent hover:bg-accent-light text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-accent/20"
            >
              Agendar tudo
            </button>
          </div>
        </div>
      </div>

      {/* Grid — min-h fixo pra flex dentro do AppLayout */}
      <div className="min-h-[500px] p-6">
        <div className="max-w-7xl mx-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-px">
            {DOW_LABELS.map((d) => (
              <div key={d} className="text-xs font-medium text-text-tertiary py-2 text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {Array.from({ length: FIRST_DOW }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-surface min-h-[120px]" />
            ))}

            {DAYS.map((day) => {
              const dayPosts = postsByDay[day] ?? [];
              return (
                <div
                  key={day}
                  className="bg-surface min-h-[120px] p-2 hover:bg-surface-secondary transition-colors"
                >
                  <span className="text-xs text-text-tertiary font-medium">{day}</span>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map((post) => {
                      const Icon = postIcons[post.postType] ?? Image;
                      const color = postColors[post.postType] ?? 'border-l-gray-500';
                      const statusColor = statusColors[post.status] ?? 'bg-surface-secondary text-text-tertiary';
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          className={clsx(
                            'w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md',
                            'border-l-2 text-xs transition-colors hover:bg-surface-secondary',
                            color,
                          )}
                        >
                          <Icon className="w-3 h-3 shrink-0 text-text-tertiary" />
                          <span className="truncate text-text-secondary">{post.title}</span>
                        </button>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <p className="text-xs text-text-tertiary px-1">+{dayPosts.length - 3} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {selectedPost && (
        <PostSidePanel
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={(updated) => setSelectedPost(updated)}
        />
      )}
    </div>
  );
}
