import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export type ConfiguracoesTab =
  | 'geral'
  | 'seguranca'
  | 'faturamento'
  | 'publico'
  | 'metas';

const TAB_LABELS: { value: ConfiguracoesTab; label: string; to: string }[] = [
  { value: 'geral', label: 'Geral', to: '/configuracoes?tab=geral' },
  { value: 'seguranca', label: 'Segurança', to: '/configuracoes?tab=seguranca' },
  { value: 'faturamento', label: 'Faturamento', to: '/configuracoes?tab=faturamento' },
  { value: 'publico', label: 'Dados da Marca e Público', to: '/configuracoes?tab=publico' },
  { value: 'metas', label: 'Metas', to: '/configuracoes?tab=metas' },
];

export function ConfiguracoesTabsNav({ activeTab }: { activeTab: ConfiguracoesTab }) {
  return (
    <div className="flex overflow-x-auto border-b border-[#262824] gap-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {TAB_LABELS.map(({ value, label, to }) => {
        const isActive = activeTab === value;
        return (
          <Link
            key={value}
            to={to}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
              isActive
                ? 'border-[#1E88A8] text-[#1E88A8] font-semibold'
                : 'border-transparent text-[#9BA1A6] hover:text-[#ECEDEF] hover:border-[#262824]'
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}