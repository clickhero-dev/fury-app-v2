import { Calendar, Film, Images, LayoutGrid, Sparkles } from 'lucide-react';
import type { Post } from '../PlanejadorPage';

interface SummaryData {
  reelsCount?: number;
  carouselCount?: number;
  imageCount?: number;
  storiesCount?: number;
  targetAudience?: string;
  contentStrategy?: string;
}

interface PlanSummaryProps {
  plan: {
    id: string;
    title: string;
    objective: string;
    totalPosts: number;
    metadata: { summary?: SummaryData };
    posts: Post[];
  };
  onViewCalendar: () => void;
}

export function PlanSummary({ plan, onViewCalendar }: PlanSummaryProps) {
  const summary = plan.metadata?.summary ?? {};
  const reels = summary.reelsCount ?? plan.posts.filter((p) => p.postType === 'reel').length;
  const carousels = summary.carouselCount ?? plan.posts.filter((p) => p.postType === 'carousel').length;
  const images = summary.imageCount ?? plan.posts.filter((p) => p.postType === 'image').length;
  const stories = summary.storiesCount ?? plan.posts.filter((p) => p.postType === 'stories').length;

  const items = [
    { icon: Film, label: 'Reels', value: reels, color: 'text-purple-400 bg-purple-500/10' },
    { icon: LayoutGrid, label: 'Carrosséis', value: carousels, color: 'text-blue-400 bg-blue-500/10' },
    { icon: Images, label: 'Posts', value: images, color: 'text-green-400 bg-green-500/10' },
    { icon: Sparkles, label: 'Stories', value: stories, color: 'text-pink-400 bg-pink-500/10' },
  ];

  return (
    <div className="flex flex-col min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <h1 className="text-3xl font-semibold text-white mb-2">{plan.title}</h1>
        <p className="text-gray-400 text-lg mb-8">{plan.objective}</p>

        {/* Content counters */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#1F2937] border border-gray-700/50"
            >
              <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="text-sm text-gray-400">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-10">
          <Calendar className="w-6 h-6 text-orange-400" />
          <div>
            <p className="text-lg font-semibold text-white">
              {plan.totalPosts} conteúdos
            </p>
            <p className="text-sm text-gray-400">
              Período: {new Date(plan.posts[0]?.dayIndex ? 2026 : 2026, 6, 1).toLocaleDateString('pt-BR')} - {new Date(2026, 6, 31).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onViewCalendar}
          className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-semibold 
                     rounded-2xl text-lg transition-all duration-200
                     shadow-lg shadow-orange-500/25 hover:shadow-orange-400/40"
        >
          Ver calendário
        </button>
      </div>
    </div>
  );
}
