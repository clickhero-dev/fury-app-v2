type Status = 'active' | 'paused' | 'rejected' | 'pending' | 'pending_compliance' | 'learning' | 'approved';

interface StatusBadgeProps {
  /** Status da campanha ou recurso a ser exibido. */
  status: Status;
  className?: string;
}

/**
 * Configuração visual por status.
 * Define label em português, cor do dot indicador e estilo do badge.
 */
const config: Record<Status, { label: string; dot: string; badge: string }> = {
  active: {
    label: 'Ativo',
    dot: 'bg-green-500 animate-pulse', // Pulsante para indicar atividade em tempo real
    badge: 'bg-green-50 text-green-700',
  },
  paused: {
    label: 'Pausado',
    dot: 'bg-gray-400',
    badge: 'bg-gray-100 text-gray-600',
  },
  rejected: {
    label: 'Reprovado',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
  },
  approved: {
    label: 'Aprovado',
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700',
  },
  pending: {
    label: 'Pendente',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-50 text-yellow-700',
  },
  pending_compliance: {
    label: 'Pendência Compliance',
    dot: 'bg-orange-400',
    badge: 'bg-orange-50 text-orange-700',
  },
  learning: {
    label: 'Aprendendo',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700',
  },
};

/**
 * Badge visual para exibir o status de uma campanha ou recurso.
 *
 * Exibe um dot colorido ao lado de um label em português.
 * O status `active` tem dot pulsante para indicar atividade em tempo real.
 * Status desconhecidos fazem fallback para `pending`.
 *
 * @param status - Status atual do recurso
 * @param className - Classes CSS adicionais opcionais
 *
 * @example
 * <StatusBadge status="active" />
 * <StatusBadge status="paused" className="ml-2" />
 */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  // Normaliza para lowercase para garantir correspondência independente do case da API
  const normalizedStatus = status?.toLowerCase() as Status;
  const { label, dot, badge } = config[normalizedStatus] || config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

export default StatusBadge;