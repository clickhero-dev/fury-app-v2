import { Sparkles, Wand2, LayoutGrid } from 'lucide-react';
import { Button } from '@/components';
import { FUNNEL_LABEL } from '@/lib/layout-labels';
import type { SelectLayoutResponse } from '@/types/studio';

interface Props {
  suggestion: SelectLayoutResponse;
  onAccept: () => void;
  onChooseManually: () => void;
}

export function LayoutSuggestion({ suggestion, onAccept, onChooseManually }: Props) {
  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF4ED] px-3 py-1 text-xs font-semibold text-[#B54708]">
          <Sparkles className="h-3.5 w-3.5" />
          Sugestão do FURY
        </div>
        <h2 className="mt-3 text-xl font-bold text-[#101828]">O melhor formato para o seu anúncio</h2>
      </div>

      <div className="rounded-2xl border-2 border-[#EA580C] bg-[#FFFBF8] p-5 space-y-3 shadow-[0_0_0_3px_rgba(234,88,12,0.08)]">
        <div>
          <p className="text-2xl font-bold text-[#101828]">{suggestion.label}</p>
          <p className="text-sm text-[#B54708] font-medium mt-0.5">
            Recomendado para {FUNNEL_LABEL[suggestion.funnel_stage].toLowerCase()}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-[#F0DCCB] p-3">
          <p className="text-sm text-[#475467] leading-relaxed">{suggestion.justification}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          onClick={onAccept}
          className="w-full inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold"
        >
          <Wand2 className="h-4 w-4" />
          Usar esta sugestão
        </Button>
        <Button
          variant="outline"
          onClick={onChooseManually}
          className="w-full inline-flex items-center justify-center gap-2"
        >
          <LayoutGrid className="h-4 w-4" />
          Escolher manualmente
        </Button>
      </div>
    </div>
  );
}
