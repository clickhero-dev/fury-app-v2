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
    <div className="flex overflow-x-auto scrollbar-none border-b border-border gap-0">
      {TAB_LABELS.map(({ value, label, to }) => {
        const isActive = activeTab === value;
        return (
          <Link
            key={value}
            to={to}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
