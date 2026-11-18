import { useEffect, useId, useRef, useState } from 'react';
import { quickActions, quickActionSuggestions, type QuickAction, type QuickActionContext } from './quick-actions';

export function ChatQuickActions({ selected, onChange, onSelect, context, disabled = false }: {
  selected: QuickAction | null;
  onChange: (action: QuickAction | null) => void;
  onSelect: (answer: string) => Promise<void>;
  context: QuickActionContext;
  disabled?: boolean;
}) {
  const questionId = useId();
  const questionRef = useRef<HTMLParagraphElement>(null);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { if (selected) questionRef.current?.focus(); }, [selected]);
  async function select(answer: string) {
    if (disabled || sending.current) return;
    sending.current = true; setPending(true);
    try { await onSelect(answer); }
    finally { sending.current = false; setPending(false); }
  }
  if (selected) return <section className="ady-chat-action-start" aria-label={selected.label}>
    <h2>{selected.label}</h2>
    <p id={questionId} ref={questionRef} tabIndex={-1}>{selected.question}</p>
    <div role="group" aria-labelledby={questionId} className="ady-chat-action-suggestions">
      {quickActionSuggestions(selected, context).map(answer => <button key={answer} type="button" disabled={disabled || pending} onClick={() => { void select(answer); }}>{answer}</button>)}
    </div>
    <p>Escolha uma sugestão ou responda pelo compositor “Mensagem” abaixo.</p>
    <p>Você revisará e confirmará qualquer geração com custo, publicação, agendamento ou campanha. Contas e permissões serão verificadas no fluxo.</p>
    <div><button type="button" disabled={disabled || pending} onClick={() => onChange(null)}>Cancelar</button></div>
  </section>;
  return <div className="ady-chat-quick" role="group" aria-label="Ações para começar">
    {quickActions.map(action => <button key={action.label} type="button" disabled={disabled} onClick={() => onChange(action)}>
      <action.icon size={18} aria-hidden="true"/> {action.label}
    </button>)}
  </div>;
}
