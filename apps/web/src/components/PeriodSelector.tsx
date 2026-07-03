import { type Period, PERIOD_LABELS } from '@/lib/period-utils';

/**
 * Seletor de período para filtros de data nos dashboards e relatórios.
 *
 * Renderiza um grupo de botões pill para cada período disponível em `PERIOD_LABELS`.
 * O período ativo é destacado em laranja; os demais têm estilo de borda neutra.
 *
 * Os períodos disponíveis são definidos em `@/lib/period-utils` e podem incluir
 * opções como: hoje, ontem, últimos 7 dias, este mês, etc.
 *
 * @param value - Período atualmente selecionado
 * @param onChange - Callback chamado ao selecionar um novo período
 *
 * @example
 * const [period, setPeriod] = useState<Period>('this_month');
 *
 * <PeriodSelector value={period} onChange={setPeriod} />
 */
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