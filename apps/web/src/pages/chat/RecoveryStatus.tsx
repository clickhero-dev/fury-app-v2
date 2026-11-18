import { useRef, useState } from 'react';

export type RecoveryState = 'running' | 'recovering' | 'cancel_requested' | 'cancelled' | 'uncertain' | 'failed' | 'completed';
const descriptions: Record<RecoveryState, string> = {
  running: 'Ady está trabalhando.',
  recovering: 'Recuperando o andamento, sem reenviar sua mensagem.',
  cancel_requested: 'Cancelamento solicitado. Aguardando confirmação das próximas etapas.',
  cancelled: 'Próximas etapas canceladas. Uma ação externa já iniciada pode continuar.',
  uncertain: 'Resultado externo não confirmado. Verifique o status antes de tentar novamente.',
  failed: 'A execução foi pausada. Consulte os resultados já disponíveis antes de fazer outro pedido.',
  completed: 'Execução concluída.',
};

/** Mount with key=runId so a different run never inherits a cancellation request. */
export function RecoveryStatus({ status, onCancel, onRedirect }: { status: RecoveryState; onCancel: () => Promise<void>; onRedirect?: () => void }) {
  const [request, setRequest] = useState<'idle' | 'sending' | 'sent' | 'uncertain'>('idle');
  const started = useRef(false);
  const cancellable = status === 'running' || status === 'recovering';
  async function cancel() {
    if (started.current || !cancellable) return;
    started.current = true;
    setRequest('sending');
    try {
      await onCancel();
      setRequest('sent');
    } catch {
      setRequest('uncertain');
    }
  }
  return <section className="ady-chat-recovery" aria-label="Andamento da execução">
    <p role="status">{descriptions[status]}</p>
    {status === 'cancelled' && onRedirect && <button type="button" onClick={onRedirect}>Ver outra ideia</button>}
    {cancellable && <>
      <p>Cancelar impede apenas próximas etapas. Uma ação externa já iniciada pode continuar.</p>
      <button type="button" disabled={request !== 'idle'} onClick={() => void cancel()}>Cancelar próximas etapas</button>
      {request === 'sending' && <p role="status">Solicitando cancelamento…</p>}
      {request === 'sent' && <p role="status">Solicitação enviada. Aguardando confirmação do status.</p>}
      {request === 'uncertain' && <p role="alert">Não foi possível confirmar o cancelamento. Estamos verificando o status; não repita a solicitação.</p>}
    </>}
  </section>;
}
