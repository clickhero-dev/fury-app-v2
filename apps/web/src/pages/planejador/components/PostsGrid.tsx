import { Check, ImageOff } from 'lucide-react';
import type { Post } from '../types';
import { complianceBadge } from '@/lib/compliance.utils';

interface PostsGridProps {
  posts: Post[];
  onSelect: (post: Post) => void;
}

const typeLabels: Record<string, string> = {
  carousel: 'Carrossel',
  reel: 'Reels',
  image: 'Post',
  stories: 'Stories',
};

/**
 * Grade dos posts de um plano. Post sem imagem (falha na geração) aparece com
 * placeholder e CTA — clicando abre o painel para regenerar/ajustar.
 */
export function PostsGrid({ posts, onSelect }: PostsGridProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl bg-surface-secondary/40 border border-border/50 p-6 text-center text-sm text-text-tertiary">
        Este plano ainda não tem posts.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {posts.map((post) => {
        const badge = complianceBadge(post.compliance?.status ?? null, post.compliance?.notes ?? null);
        return (
        <button
          key={post.id}
          type="button"
          onClick={() => onSelect(post)}
          className="group relative text-left cursor-pointer"
          aria-label={`Editar post ${typeLabels[post.postType] ?? post.postType} de ${post.date}`}
        >
          {post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt={post.caption ?? post.title ?? 'Post do plano'}
              loading="lazy"
              className="aspect-square w-full rounded-xl object-cover border border-border/50 transition-all group-hover:border-accent/40 group-hover:shadow-lg group-hover:shadow-accent/10"
            />
          ) : (
            <div className="aspect-square w-full rounded-xl bg-surface-secondary border border-dashed border-border/70 flex flex-col items-center justify-center gap-2 text-text-tertiary transition-all group-hover:border-accent/40">
              <ImageOff className="size-5" />
              <span className="text-[11px] px-3 text-center">Imagem pendente — clique para gerar</span>
            </div>
          )}
          {badge.tone === 'approved' && post.imageUrl && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-green-600/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <Check className="h-2.5 w-2.5" />
              {badge.label}
            </span>
          )}
          {badge.tone === 'rejected' && (
            <>
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-red-600/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                {badge.label}
              </span>
              {badge.reasons.length > 0 && (
                <div className="absolute inset-x-1.5 bottom-1.5 space-y-0.5 rounded-lg bg-black/75 px-2 py-1.5 backdrop-blur-sm">
                  {badge.reasons.slice(0, 2).map((reason, i) => (
                    <p key={i} className="line-clamp-2 text-[10px] leading-snug text-white/90">
                      • {reason}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          {badge.tone === 'pending' && post.imageUrl && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              {badge.label}
            </span>
          )}
          <div className="mt-2 flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-text-primary">
              {typeLabels[post.postType] ?? post.postType}
            </span>
            <span className="text-[11px] text-text-tertiary">
              {new Date(`${post.date}T12:00:00Z`).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </button>
        );
      })}
    </div>
  );
}