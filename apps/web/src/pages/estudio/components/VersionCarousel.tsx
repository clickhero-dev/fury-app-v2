import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioAssetVersion } from '@/types/studio';

interface VersionCarouselProps {
  versions: StudioAssetVersion[];
  activeVersionId: string;
  onSelect: (versionId: string) => void;
}

/**
 * Numeração das versões de um grupo de criativo, abaixo da imagem — clicar
 * num número pula direto pra aquela versão, ou usar as setas de
 * anterior/próximo. Some quando o grupo só tem uma versão (nada pra navegar).
 */
export function VersionCarousel({ versions, activeVersionId, onSelect }: VersionCarouselProps) {
  if (versions.length <= 1) return null;

  const activeIndex = versions.findIndex((v) => v.id === activeVersionId);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < versions.length - 1;

  const navButtonClass =
    'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-text-tertiary transition-all hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-tertiary';

  return (
    <div className="flex items-center justify-between py-2" role="tablist" aria-label="Versões deste criativo">
      <button
        type="button"
        aria-label="Versão anterior"
        disabled={!hasPrevious}
        onClick={() => hasPrevious && onSelect(versions[activeIndex - 1].id)}
        className={navButtonClass}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Anterior
      </button>

      <div className="flex items-center gap-1.5">
        {versions.map((version, index) => {
          const isActive = version.id === activeVersionId;
          return (
            <button
              key={version.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Ver versão ${index + 1} de ${versions.length}`}
              onClick={() => onSelect(version.id)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all',
                isActive
                  ? 'bg-[#E8631A] text-white'
                  : 'bg-surface-muted text-text-tertiary hover:bg-surface-hover',
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Próxima versão"
        disabled={!hasNext}
        onClick={() => hasNext && onSelect(versions[activeIndex + 1].id)}
        className={navButtonClass}
      >
        Próximo
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
