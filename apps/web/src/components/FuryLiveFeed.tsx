import { useFuryLiveFeed, type FuryFeedEvent } from '@/hooks/useFuryLiveFeed';
import { Card } from '@/components';

function getEventIcon(event: string): string {
  const icons: Record<string, string> = {
    rule_created: '✨',
    rule_updated: '✏️',
    rule_deleted: '🗑️',
    rule_executed: '⚡',
    rule_triggered: '🎯',
    'fury:update': '🔄',
    campaign_paused: '⏸️',
    campaign_resumed: '▶️',
    budget_reduced: '💰',
    notification_sent: '🔔',
  };
  return icons[event] || '📢';
}

function getEventLabel(event: string): string {
  const labels: Record<string, string> = {
    rule_created: 'Regra criada',
    rule_updated: 'Regra atualizada',
    rule_deleted: 'Regra deletada',
    rule_executed: 'Regra executada',
    rule_triggered: 'Regra disparada',
    'fury:update': 'Update do FURY',
    campaign_paused: 'Campanha pausada',
    campaign_resumed: 'Campanha retomada',
    budget_reduced: 'Orçamento reduzido',
    notification_sent: 'Notificação enviada',
  };
  return labels[event] || 'Evento';
}

function getEventColor(event: string): string {
  if (event.includes('created') || event.includes('resumed') || event.includes('triggered'))
    return 'border-green-500/30 bg-green-500/5';
  if (event.includes('deleted') || event.includes('paused'))
    return 'border-red-500/30 bg-red-500/5';
  if (event.includes('updated') || event.includes('executed') || event.includes('fury'))
    return 'border-blue-500/30 bg-blue-500/5';
  return 'border-gray-500/30 bg-gray-500/5';
}

function EventItem({ event }: { event: FuryFeedEvent }) {
  return (
    <div
      className={`border rounded-lg p-4 transition-all animate-in slide-in-from-right-full duration-300 ${getEventColor(event.event)}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{getEventIcon(event.event)}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-primary text-sm">
            {getEventLabel(event.event)}
          </h4>
          <p className="text-xs text-text-secondary mt-1">
            {new Date(event.timestamp).toLocaleTimeString('pt-BR')}
          </p>
          {typeof event.data === 'object' && event.data && (
            <div className="mt-2 text-xs text-text-secondary bg-surface rounded p-2 font-mono overflow-auto max-h-20">
              {JSON.stringify(event.data, null, 2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FuryLiveFeed() {
  const { events, isConnected, isConnecting, error } = useFuryLiveFeed();

  const statusLabel = isConnected ? 'Ao vivo' : isConnecting ? 'Reconectando...' : 'Desconectado';
  const statusColor = isConnected
    ? 'bg-green-500/10 text-green-400'
    : isConnecting
      ? 'bg-yellow-500/10 text-yellow-400'
      : 'bg-red-500/10 text-red-400';
  const dotColor = isConnected ? 'bg-green-400' : isConnecting ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">Feed ao Vivo</h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${statusColor}`}>
              <span className={`inline-block w-2.5 h-2.5 rounded-full animate-pulse ${dotColor}`} />
              {statusLabel}
            </span>
          </div>
        </div>

        {error && !isConnected && !isConnecting && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-8 text-text-secondary text-sm">
              {isConnected ? 'Aguardando eventos em tempo real...' : 'Conectando ao servidor...'}
            </div>
          ) : (
            events.map((event, index) => <EventItem key={index} event={event} />)
          )}
        </div>
      </div>
    </Card>
  );
}
