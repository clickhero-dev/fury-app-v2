import { useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { GoogleSuggestion } from '@/types/google';

const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const storageKey = (profileId: string) => `gmb-dismissed-suggestions:${profileId}`;

// localStorage pode falhar (aba anônima, bloqueio); sem ele só não lembra
function readDismissed(profileId: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

// Marca como dispensada por 14 dias e persiste
function dismissSuggestion(profileId: string, dismissed: Record<string, number>, id: string) {
  const next = { ...dismissed, [id]: Date.now() + DISMISS_TTL_MS };
  try {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify(next));
  } catch {
    // sem persistência
  }
  return next;
}

interface SuggestionCarouselProps {
  profileId: string;
  suggestions: GoogleSuggestion[];
  onAction: (action: string) => void;
}

/** Cards de sugestão dispensáveis, como no painel do Google. */
export function SuggestionCarousel({ profileId, suggestions, onAction }: SuggestionCarouselProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(profileId));
  const scroller = useRef<HTMLDivElement>(null);
  const visible = suggestions.filter((s) => !dismissed[s.id]);

  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed(dismissSuggestion(profileId, dismissed, id));
  }

  return (
    <div className="relative">
      <div ref={scroller} className="gmb-carousel flex snap-x gap-4 overflow-x-auto" role="list" aria-label="Sugestões">
        {visible.map((s) => (
          <div
            key={s.id}
            role="listitem"
            className="gmb-card flex w-[280px] shrink-0 snap-start flex-col justify-between gap-6 p-5 sm:w-[300px]"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg leading-snug font-normal">{s.title}</h3>
                <button
                  type="button"
                  className="gmb-icon-button -mt-1 -mr-1 shrink-0 p-1.5"
                  aria-label={`Dispensar: ${s.title}`}
                  onClick={() => dismiss(s.id)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="gmb-text-2 text-sm leading-relaxed">{s.description}</p>
            </div>
            <button
              type="button"
              className="gmb-blue self-start text-sm font-medium hover:underline"
              onClick={() => onAction(s.cta.action)}
            >
              {s.cta.label}
            </button>
          </div>
        ))}
      </div>
      {visible.length > 1 && (
        <button
          type="button"
          className="gmb-scroll-button absolute top-1/2 right-0 hidden -translate-y-1/2 p-2 shadow-sm sm:block"
          aria-label="Próximas sugestões"
          onClick={() => scroller.current?.scrollBy({ left: 316, behavior: 'smooth' })}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
