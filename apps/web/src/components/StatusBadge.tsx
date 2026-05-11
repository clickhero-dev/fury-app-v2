type Status = 'active' | 'paused' | 'rejected' | 'pending' | 'learning' | 'approved';
 
interface StatusBadgeProps {
  status: Status;
  className?: string;
}
 
const config: Record<Status, { label: string; dot: string; badge: string }> = {
  active: {
    label: 'Ativo',
    dot: 'bg-green-500 animate-pulse',
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
  learning: {
    label: 'Aprendendo',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700',
  },
};
 
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase() as Status;

const { label, dot, badge } =
  config[normalizedStatus] || config.pending;
 
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