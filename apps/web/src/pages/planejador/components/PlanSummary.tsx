import { Calendar, Image, LayoutGrid, Sparkles, Film, ArrowRight } from 'lucide-react';
import type { Post } from '../types';

interface SummaryData {
  reelsCount?: number;
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
    periodStart?: string;
    periodEnd?: string;
  };
  onViewCalendar: () => void;
}

function formatPeriod(start?: string, end?: string): string {
  if (!start || !end) return '1 a 31 de julho de 2026';
  const s = new Date(start);
  const e = new Date(end);
  const months = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${s.getDate()} a ${e.getDate()} de ${months[s.getMonth()]} de ${s.getFullYear()}`;
}

export function PlanSummary({ plan, onViewCalendar }: PlanSummaryProps) {
  const summary = plan.metadata?.summary ?? {};
  const reels = summary.reelsCount ?? plan.posts?.filter((p) => p.postType === 'reel').length ?? 0;
  const carousels = summary.carouselCount ?? plan.posts?.filter((p) => p.postType === 'carousel').length ?? 0;
  const images = summary.imageCount ?? plan.posts?.filter((p) => p.postType === 'image').length ?? 0;
  const stories = summary.storiesCount ?? plan.posts?.filter((p) => p.postType === 'stories').length ?? 0;

  const items = [
    { icon: Film, label: 'Reels', value: reels, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
    { icon: LayoutGrid, label: 'Carrosséis', value: carousels, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    { icon: Image, label: 'Posts Estáticos', value: images, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    { icon: Sparkles, label: 'Stories', value: stories, color: 'text-pink-500 bg-pink-500/10 border-pink-500/20' },
  ];

  return (
    <div className="py-8 max-w-2xl mx-auto">
      {/* Cabeçalho */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20 mb-3">
          <Sparkles className="size-3.5" />
          Planejamento Concluído
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">
          {plan.title}
        </h1>
        <p className="mt-2 text-base text-text-tertiary leading-relaxed">
          {plan.objective}
        </p>
      </div>

      {/* Grid de Contadores de Conteúdo */}
      <div className="grid grid-cols-2 gap-3.5 mb-6">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3.5 p-4 rounded-2xl bg-surface border border-border transition-all hover:border-accent/30"
          >
            <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 border ${item.color}`}>
              <item.icon className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary tabular-nums">{item.value}</p>
              <p className="text-xs font-medium text-text-tertiary">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Total e Período */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface/50 border border-border mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <Calendar className="size-5 text-accent" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {plan.totalPosts} conteúdos programados
            </p>
            <p className="text-xs text-text-tertiary">
              Período: {formatPeriod(plan.periodStart, plan.periodEnd)}
            </p>
          </div>
        </div>
      </div>

      {/* Botão de Ação (CTA) usando a classe oficial da marca */}
      <button
        onClick={onViewCalendar}
        type="button"
        className="gradient-spark w-full py-3.5 px-6 rounded-2xl font-semibold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 group cursor-pointer"
      >
        <p className="text-white">Ver Calendário Completo</p>
        <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform text-white" />
      </button>
    </div>
  );
}