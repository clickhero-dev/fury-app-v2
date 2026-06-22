import { useFuryLiveFeed, type FuryFeedEvent } from '@/hooks/useFuryLiveFeed';
import { Card } from '@/components';

/**
 * Converte uma string de data ISO em tempo relativo legível em português.
 *
 * @param dateString - Data no formato ISO 8601
 * @returns Tempo relativo (ex: "agora", "há 5 min", "há 2h", "há 1d")
 */
function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'agora';
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)}h`;
  return `há ${Math.floor(seconds / 86400)}d`;
}

/**
 * Retorna as classes CSS do badge de ação conforme o tipo de automação.
 *
 * @param action - Tipo de ação executada pelo FURY Engine
 * @returns Classes Tailwind para colorir o badge
 */
function getActionBadgeColor(action: string): string {
  if (action === 'pause_campaign') return 'bg-red-50 text-red-600 border border-red-200';
  if (action === 'reduce_budget') return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
  if (action === 'increase_budget') return 'bg-green-50 text-green-700 border border-green-200';
  if (action === 'notify') return 'bg-blue-50 text-blue-600 border border-blue-200';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

/**
 * Converte a chave de ação do FURY Engine em label legível em português.
 *
 * @param action - Chave da ação (ex: 'pause_campaign')
 * @returns Label traduzido ou a própria chave se não mapeada
 */
function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    pause_campaign: 'Pausar',
    reduce_budget: 'Reduzir',
    increase_budget: 'Aumentar',
    notify: 'Notificar',
  };
  return labels[action] || action;
}

/** Payload do evento `rule_triggered` recebido via SSE. */
interface RuleTriggeredData {
  id?: string;
  ruleId?: string;
  ruleType?: string;
  campaignId?: string;
  campaignName?: string;
  reason?: string;
  action?: string;
  timestamp?: string;
}

/**
 * Sub-componente que renderiza um evento de regra disparada pelo FURY Engine.
 * Exibe o nome da campanha, a ação executada e o motivo do disparo.
 */
function RuleTriggeredEvent({ event }: { event: FuryFeedEvent }) {
  const data = event.data as RuleTriggeredData;
  const action = data.action || '';

  return (
    <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-4 transition-all animate-in slide-in-from-top duration-300">
      <div className="flex items-start gap-3">
        <span className="text-2xl">⚡</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="font-semibold text-text-primary text-sm">
              {data.campaignName || 'Campanha desconhecida'}
            </h4>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getActionBadgeColor(action)}`}>
              {getActionLabel(action)}
            </span>
          </div>
          {data.reason && (
            <p className="text-xs text-text-secondary mb-2">{data.reason}</p>
          )}
          <p className="text-xs text-text-secondary/60">
            {getRelativeTime(event.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Sub-componente que renderiza um evento de atualização de scores do FURY Engine.
 * Exibe os scores e grades das campanhas processadas no ciclo (máximo 3 visíveis).
 */
function FuryUpdateEvent({ event }: { event: FuryFeedEvent }) {
  const data = event.data as {
    timestamp?: string;
    scores?: Array<{ campaignId: string; campaignName: string; score: number; grade: string }>;
  };

  return (
    <div className="border border-blue-500/30 bg-blue-500/5 rounded-lg p-4 transition-all animate-in slide-in-from-right-full duration-300">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔄</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-primary text-sm mb-2">
            Update do FURY
          </h4>
          {data.scores && data.scores.length > 0 && (
            <div className="space-y-1">
              {data.scores.slice(0, 3).map((score) => (
                <div key={score.campaignId} className="text-xs text-text-secondary flex items-center justify-between">
                  <span>{score.campaignName}</span>
                  <span className="text-text-primary font-semibold">
                    {score.score} ({score.grade})
                  </span>
                </div>
              ))}
              {data.scores.length > 3 && (
                <div className="text-xs text-text-secondary/60">
                  +{data.scores.length - 3} mais
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-text-secondary/60 mt-2">
            {getRelativeTime(event.timestamp || new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Componente de feed em tempo real de eventos do FURY Engine.
 *
 * Conecta via SSE usando `useFuryLiveFeed` e exibe os eventos recebidos
 * em ordem cronológica reversa (mais recente primeiro).
 *
 * Tipos de evento suportados:
 * - `rule_triggered` → regra de automação disparada
 * - `fury:update` → atualização de scores de campanhas
 *
 * Indicador de status da conexão:
 * - 🟢 "Ao vivo" → conectado
 * - 🟡 "Reconectando..." → tentando reconectar
 * - 🔴 "Desconectado" → falha na conexão
 *
 * @example
 * <FuryLiveFeed />
 */
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
          <h3 className="text-lg font-bold text-text-primary">Feed da IA</h3>
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
            events.map((event, index) => {
              if (event.event === 'rule_triggered') {
                return <RuleTriggeredEvent key={index} event={event} />;
              }
              if (event.event === 'fury:update') {
                return <FuryUpdateEvent key={index} event={event} />;
              }
              return null;
            })
          )}
        </div>
      </div>
    </Card>
  );
}