import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Film, LayoutGrid, Image, Sparkles, CheckCircle, Clock } from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import type { Post } from '../PlanejadorPage';

interface CalendarViewProps {
  plan: {
    id: string;
    title: string;
    objective: string;
    totalPosts: number;
    posts: Post[];
  };
}

const postIcons: Record<string, typeof Film> = {
  reel: Film,
  carousel: LayoutGrid,
  image: Image,
  stories: Sparkles,
};

const postColors: Record<string, string> = {
  reel: 'border-l-purple-500',
  carousel: 'border-l-blue-500',
  image: 'border-l-green-500',
  stories: 'border-l-pink-500',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  approved: 'bg-green-500/20 text-green-400',
  rejected: 'bg-red-500/20 text-red-400',
  published: 'bg-blue-500/20 text-blue-400',
};

// Dias do mês (julho = 31 dias)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const FIRST_DOW = 2; // 1/jul/2026 = quarta-feira → index 2 (0=domingo)

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarView({ plan }: CalendarViewProps) {
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
    <div className="flex flex-col min-h-screen">
      {/* ApprovalBar */}
      <div className="sticky top-0 z-30 bg-[#111827]/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{plan.title}</h2>
            <p className="text-sm text-gray-400">
              {totalApproved} de {plan.totalPosts} aprovados
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {plan.totalPosts} conteúdos
            </span>
            <button
              disabled={totalApproved < plan.totalPosts}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 
                         disabled:cursor-not-allowed text-white font-medium rounded-xl 
                         transition-all duration-200 shadow-lg shadow-orange-500/20"
            >
              Agendar tudo
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-px">
            {DOW_LABELS.map((d) => (
              <div key={d} className="text-xs font-medium text-gray-500 py-2 text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-gray-800/50 rounded-lg overflow-hidden">
            {/* Empty cells before first day */}
            {Array.from({ length: FIRST_DOW }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-[#1F2937] min-h-[120px]" />
            ))}

            {DAYS.map((day) => {
              const dayPosts = postsByDay[day] ?? [];
              return (
                <div
                  key={day}
                  className="bg-[#1F2937] min-h-[120px] p-2 hover:bg-[#243044] transition-colors"
                >
                  <span className="text-xs text-gray-500 font-medium">{day}</span>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 3).map((post) => {
                      const Icon = postIcons[post.postType] ?? Image;
                      const color = postColors[post.postType] ?? 'border-l-gray-500';
                      const statusColor = statusColors[post.status] ?? 'bg-gray-500/20 text-gray-400';
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          className={clsx(
                            'w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md',
                            'border-l-2 text-xs transition-colors hover:bg-gray-700/30',
                            color,
                          )}
                        >
                          <Icon className="w-3 h-3 shrink-0 text-gray-400" />
                          <span className="truncate text-gray-300">{post.title}</span>
                        </button>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <p className="text-xs text-gray-500 px-1">+{dayPosts.length - 3} mais</p>
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
          onUpdate={(updated) => {
            // Atualiza localmente — refresh virá no próximo GET
            setSelectedPost(updated);
          }}
        />
      )}
    </div>
  );
}
