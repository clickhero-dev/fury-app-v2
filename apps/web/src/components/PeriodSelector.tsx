import { type Period, PERIOD_LABELS } from '@/lib/period-utils';

export function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            value === p
              ? 'bg-[#EA580C] text-white'
              : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
