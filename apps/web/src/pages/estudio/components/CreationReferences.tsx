import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Uma única biblioteca e seleção, com divulgação progressiva por teclado/toque. */
export function CreationReferences({
  title,
  selected,
  children,
}: {
  title: string;
  selected: number;
  children: ReactNode;
}) {
  return (
    <details className="studio-references group rounded-2xl border border-border bg-surface">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-4 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-text-secondary">
            Opcional{selected > 0 ? ` · ${selected} selecionada${selected > 1 ? 's' : ''}` : ''}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid min-w-0 gap-4 border-t border-border p-4 lg:grid-cols-[minmax(0,1fr)_320px]">{children}</div>
    </details>
  );
}
