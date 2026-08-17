import { type Period, PERIOD_LABELS } from '@/lib/period-utils';

export function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-2">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => {
        const isActive = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            // Ajuste nas classes de borda e hover
            className={`text-xs px-4 py-2 rounded-full font-medium transition-all duration-150 cursor-pointer border ${
              isActive
                ? 'filter-pill-active bg-brand text-white border-brand' // Ativo: Borda da cor da marca
                : 'bg-[#1A1B18] text-[#A3A8B3] border-transparent hover:bg-[#242622] hover:text-white hover:border-[#3F423B]' // Inativo: Borda transparente vira cinza no hover
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}