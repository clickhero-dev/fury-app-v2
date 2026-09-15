import { cn } from '@/lib/utils';
import type { StudioAssetVersion } from '@/types/studio';

interface VersionCarouselProps {
  versions: StudioAssetVersion[];
  activeVersionId: string;
  onSelect: (versionId: string) => void;
}

/**
 * Numeração das versões de um grupo de criativo, abaixo da imagem — clicar
 * num número pula direto pra aquela versão. Some quando o grupo só tem uma
 * versão (nada pra navegar).
 */
export function VersionCarousel({ versions, activeVersionId, onSelect }: VersionCarouselProps) {
  if (versions.length <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 py-2" role="tablist" aria-label="Versões deste criativo">
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
  );
}
