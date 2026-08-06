import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { LayoutGrid, Image, Sparkles, Film, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { PostSidePanel } from './PostSidePanel';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import type { Post, Plan } from '../types';

interface CalendarViewProps {
  plan: Plan;
  onConfirm?: () => void;
  confirmed?: boolean;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TYPE_ICONS: Record<string, typeof Image> = {
  carousel: LayoutGrid,
  reel: Film,
  image: Image,
  stories: Sparkles,
};
const TYPE_LABELS: Record<string, string> = {
  carousel: 'Carrossel',
  reel: 'Reels',
  image: 'Post',
  stories: 'Stories',
};

function getDayOfWeek(dayIndex: number): number {
  const date = new Date(new Date().getFullYear(), new Date().getMonth(), dayIndex);
  return date.getDay();
}

function getDaysInMonth(): number {
  return new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
}

export function CalendarView({ plan, onConfirm, confirmed }: CalendarViewProps) {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const daysInMonth = getDaysInMonth();
  const firstDay = getDayOfWeek(1);

  const postsByDay = useMemo(() => {
    const map = new Map<number, Post[]>();
    plan.posts.forEach(p => {
      const arr = map.get(p.dayIndex) || [];
      arr.push(p);
      map.set(p.dayIndex, arr);
    });
    return map;
  }, [plan.posts]);

  const brandingApproved = plan.metadata?.branding?.approved;
  const qualityPassed = plan.metadata?.quality?.passed;
  const brandingNotes = plan.metadata?.branding?.notes;

  const grid = [];
  for (let i = 0; i < firstDay; i++) grid.push(<div key={`empty-${i}`} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const posts = postsByDay.get(day) || [];
    const dayButton = (
      <button
        key={day}
        onClick={() => posts.length > 0 && setSelectedPost(posts[0])}
        className={clsx(
          'relative min-h-[80px] rounded-lg border border-gray-700/50 p-1.5 text-left transition-colors',
          posts.length > 0 ? 'bg-gray-800/60 hover:bg-gray-700/60 cursor-pointer' : 'bg-transparent',
        )}
      >
        <span className="text-xs text-gray-500">{day}</span>
        {posts.slice(0, 3).map(post => {
          const Icon = TYPE_ICONS[post.postType] || Image;
          return (
            <div key={post.id} className="flex items-center gap-1 mt-1">
              <Icon className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="text-[10px] text-gray-400 truncate">{post.title}</span>
            </div>
          );
        })}
        {posts.length > 3 && <span className="text-[10px] text-gray-500">+{posts.length - 3}</span>}
      </button>
    );

    if (posts.length === 0) {
      grid.push(dayButton);
      continue;
    }

    grid.push(
      <Tooltip key={day}>
        <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            {posts.map(post => (
              <p key={post.id} className="text-xs">
                <span className="text-text-tertiary">{TYPE_LABELS[post.postType] ?? post.postType}:</span>{' '}
                {post.title || 'Sem título'}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>,
    );
  }

  return (
    <div className="space-y-6">
      {/* Approval Bar */}
      {plan.status === 'draft' && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-gray-800/60 border border-gray-700/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className={clsx('h-5 w-5', brandingApproved ? 'text-green-400' : 'text-yellow-400')} />
              <span className="text-sm text-gray-300">
                {brandingApproved ? 'Aprovado por compliance' : 'Aguardando aprovação'}
              </span>
            </div>
            {qualityPassed === false && (
              <span className="text-xs text-red-400">Qualidade: revisão necessária</span>
            )}
            {brandingNotes && (
              <span className="text-xs text-gray-500 truncate max-w-[200px]">{brandingNotes}</span>
            )}
          </div>
          {!confirmed && brandingApproved && (
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium hover:from-green-500 hover:to-emerald-500 transition-all"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar e Agendar
            </button>
          )}
        </div>
      )}

      {/* Confirmed badge */}
      {confirmed && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-900/20 border border-green-700/30">
          <CheckCircle2 className="h-6 w-6 text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-300">Plano confirmado</p>
            <p className="text-xs text-gray-400">O conteúdo será publicado conforme o calendário</p>
          </div>
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
        <PostSidePanel post={selectedPost} onClose={() => setSelectedPost(null)} onUpdate={(updated) => setSelectedPost(updated)} />
      )}
    </div>
  );
}
