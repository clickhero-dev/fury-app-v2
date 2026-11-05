import { Zap, TrendingUp, PauseCircle, Users, RefreshCw, PieChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InsightCardProps {
  /** Tipo do insight — define o ícone exibido. */
  type: string;
  /** Prioridade do insight — define a cor da borda e do badge. */
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  /** Impacto esperado ao aplicar o insight (ex: "Redução de 15-20% no CPA"). */
  expectedImpact?: string;
}

/**
 * Mapa de tipos de insight para ícones correspondentes.
 * Tipos não mapeados usam o ícone padrão `Zap`.
 */
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  budget_adjustment: TrendingUp,
  budget_optimization: PieChart,
  campaign_pause: PauseCircle,
  audience_expansion: Users,
  creative_refresh: RefreshCw,
};

/**
 * Configuração visual por nível de prioridade.
 * Define label, cor do dot, cor da borda esquerda e estilo do badge.
 */
const PRIORITY_CONFIG = {
  high: {
    label: 'Alta prioridade',
    dotClass: 'bg-error',
    borderStyle: { borderLeftColor: 'var(--color-error)' },
    badgeClass: 'bg-error-light text-error',
  },
  medium: {
    label: 'Média prioridade',
    dotClass: 'bg-warning',
    borderStyle: { borderLeftColor: 'var(--color-warning)' },
    badgeClass: 'bg-warning-light text-warning',
  },
  low: {
    label: 'Baixa prioridade',
    dotClass: 'bg-border',
    borderStyle: { borderLeftColor: 'var(--color-border)' },
    badgeClass: 'bg-surface-secondary text-text-secondary',
  },
};

/**
 * Card de insight gerado pelo FURY Engine (via Claude AI).
 *
 * Exibe uma sugestão de otimização para campanhas com:
 * - Ícone visual por tipo de insight
 * - Badge de prioridade colorido (alta/média/baixa)
 * - Descrição da situação identificada
 * - Impacto esperado ao aplicar a sugestão (opcional)
 *
 * A borda esquerda colorida reforça visualmente o nível de prioridade.
 *
 * @example
 * <InsightCard
 *   type="campaign_pause"
 *   priority="high"
 *   title="Pausar campanha com CPA acima da meta"
 *   description="A campanha está com CPA de R$88,50, 77% acima da meta."
 *   expectedImpact="Redução de 15-20% no CPA médio"
 * />
 */
export function InsightCard({ type, priority, title, description, expectedImpact }: InsightCardProps) {
  const Icon = TYPE_ICONS[type] ?? Zap;
  const config = PRIORITY_CONFIG[priority];

  return (
    <div
      className="bg-surface rounded-xl border border-border border-l-4 p-5 space-y-3hover:shadow-md transition-shadow"
      style={config.borderStyle}
    >
      {/* Cabeçalho: ícone, título e badge de prioridade */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#FEF0E7] flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-accent" />
          </div>
          <h4 className="text-sm font-semibold text-text-primary leading-snug">{title}</h4>
        </div>
        <span className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0',
          config.badgeClass
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dotClass)} />
          {config.label}
        </span>
      </div>

      {/* Descrição do insight */}
      <p className="text-sm text-text-secondary leading-relaxed pl-12">{description}</p>

      {/* Impacto esperado — exibido apenas se fornecido */}
      {expectedImpact && (
        <div className="pl-12">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-[#FEF0E7] px-3 py-1 rounded-lg">
            <Zap className="w-3 h-3" />
            {expectedImpact}
          </div>
        </div>
      )}
    </div>
  );
}