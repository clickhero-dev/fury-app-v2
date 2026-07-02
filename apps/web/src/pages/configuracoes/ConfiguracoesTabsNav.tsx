import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export type ConfiguracoesTab =
  | 'geral'
  | 'notificacoes'
  | 'seguranca'
  | 'equipe'
  | 'faturamento'
  | 'integracoes'
  | 'fury'
  | 'brand-kit'
  | 'metas'
  | 'automacao'
  | 'publico';

const TAB_LABELS: { value: ConfiguracoesTab; label: string; to: string }[] = [
  { value: 'geral', label: 'Geral', to: '/configuracoes?tab=geral' },
  { value: 'notificacoes', label: 'Notificações', to: '/configuracoes?tab=notificacoes' },
  { value: 'seguranca', label: 'Segurança', to: '/configuracoes?tab=seguranca' },
  { value: 'equipe', label: 'Equipe', to: '/configuracoes?tab=equipe' },
  { value: 'faturamento', label: 'Faturamento', to: '/configuracoes?tab=faturamento' },
  { value: 'integracoes', label: 'Integrações', to: '/configuracoes?tab=integracoes' },
  { value: 'fury', label: 'FURY Engine', to: '/configuracoes?tab=fury' },
  { value: 'brand-kit', label: 'Dados da Marca', to: '/configuracoes/brand-kit' },
  { value: 'metas', label: 'Metas', to: '/configuracoes?tab=metas' },
  { value: 'automacao', label: 'Automação', to: '/configuracoes?tab=automacao' },
  { value: 'publico', label: 'Público', to: '/configuracoes?tab=publico' },
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
