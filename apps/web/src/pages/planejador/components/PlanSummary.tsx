import { Calendar, Image, LayoutGrid, Sparkles } from 'lucide-react';
import type { Post } from '../types';

interface SummaryData {
  carouselCount?: number;
  imageCount?: number;
  storiesCount?: number;
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
  const carousels = summary.carouselCount ?? plan.posts.filter((p) => p.postType === 'carousel').length;
  const images = summary.imageCount ?? plan.posts.filter((p) => p.postType === 'image').length;
  const stories = summary.storiesCount ?? plan.posts.filter((p) => p.postType === 'stories').length;

  const items = [
    { icon: LayoutGrid, label: 'Carrosséis', value: carousels, color: 'text-blue-600 bg-blue-100' },
    { icon: Image, label: 'Posts', value: images, color: 'text-success bg-success/10' },
    { icon: Sparkles, label: 'Stories', value: stories, color: 'text-pink-600 bg-pink-100' },
  ];

  return (
    <div className="py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-semibold text-text-primary mb-2">{plan.title}</h1>
        <p className="text-text-tertiary text-lg mb-8">{plan.objective}</p>

        {/* Content counters */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-border"
            >
              <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{item.value}</p>
                <p className="text-sm text-text-tertiary">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20 mb-10">
          <Calendar className="w-6 h-6 text-accent" />
          <div>
            <p className="text-lg font-semibold text-text-primary">
              {plan.totalPosts} conteúdos
            </p>
            <p className="text-sm text-text-tertiary">
              Período: 1 a 31 de julho de 2026
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onViewCalendar}
          className="w-full py-4 bg-accent hover:bg-accent-light text-white font-semibold 
                     rounded-2xl text-lg transition-all duration-200
                     shadow-lg shadow-accent/25 hover:shadow-accent-light/40"
        >
          Ver calendário
        </button>
      </div>
    </div>
  );
}
