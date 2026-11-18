import { useEffect, useId, useRef, useState } from 'react';
import { buildDirectQuickActionPrompt, contextualQuickActions, directQuickActions, guidedSetupPrompt, quickActions, buildQuickActionPrompt, type QuickAction, type QuickActionContext } from './quick-actions';

export function ChatQuickActions({onSelect,context = {},onExplore,disabled = false}: {
  onSelect:(prompt:string)=>void | Promise<void>; context?:QuickActionContext; onExplore?:()=>void; disabled?:boolean;
}) {
  const panelId=useId();
  const [expanded,setExpanded]=useState(false);
  const [specific,setSpecific]=useState<QuickAction | null>(null);
  const [answer,setAnswer]=useState('');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const sending=useRef(false);
  const answerRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(specific) answerRef.current?.focus();},[specific]);
  async function select(prompt:string) {
    if(disabled || sending.current)return;
    sending.current=true;setPending(true);setError('');
    try {await onSelect(prompt);}
    catch {setError('Não foi possível enviar este pedido. Seu texto foi preservado.');}
    finally {sending.current=false;setPending(false);}
  }
  if (specific) return <section className="ady-chat-action-start" aria-label={specific.label}>
    <h2>{specific.label}</h2>
    <label htmlFor={panelId}>{specific.question}</label>
    <textarea ref={answerRef} id={panelId} aria-label="Resposta" value={answer} onChange={event=>setAnswer(event.target.value)} disabled={disabled || pending}/>
    <p>Você revisará e confirmará qualquer geração com custo, publicação, agendamento ou campanha. Contas e permissões serão verificadas no fluxo.</p>
    <button type="button" disabled={disabled || pending || !answer.trim()} onClick={()=>{void select(buildQuickActionPrompt(specific,answer,context));}}>Continuar</button>
    <button type="button" disabled={pending} onClick={()=>{setSpecific(null);setAnswer('');setError('');}}>Cancelar</button>
    {error && <p role="alert">{error}</p>}
  </section>;
  return <>
    <div className="ady-chat-quick" role="group" aria-label="Ações específicas">
      {quickActions.map(action=><button key={action.label} type="button" disabled={disabled || pending} onClick={()=>{setAnswer('');setSpecific(action);}}><action.icon size={18} aria-hidden="true"/> {action.label}</button>)}
    </div>
    <div className="ady-chat-quick" role="group" aria-label="Ações para começar">
      {directQuickActions.map((action,index)=><button key={action.label} type="button"
        className={index===0?'ady-chat-quick-primary':undefined} disabled={disabled || pending}
        onClick={()=>{void select(buildDirectQuickActionPrompt(action,context));}}>
        <action.icon size={18} aria-hidden="true"/> {action.label}
      </button>)}
    </div>
    <button type="button" className="ady-chat-more-ideas" disabled={disabled || pending}
      onClick={()=>{void select(guidedSetupPrompt(context));}}>
      Configurar meu negócio
    </button>
    <button type="button" className="ady-chat-more-ideas" aria-expanded={expanded} aria-controls={panelId}
      disabled={disabled || pending} onClick={()=>{if(!expanded)onExplore?.();setExpanded(value=>!value);}}>
      {expanded?'Ocultar outras ideias':'Outras ideias para meu negócio'}
    </button>
    {expanded && <section id={panelId} className="ady-chat-action-start" aria-label="Outras ideias para meu negócio">
      <p>Escolha outra ideia se quiser. Você pode escrever livremente no campo Mensagem.</p>
      <div role="group" aria-label="Sugestões para meu negócio" className="ady-chat-action-suggestions">
        {contextualQuickActions(context).map(({action,suggestion})=><button key={action.label} type="button" disabled={disabled || pending}
          onClick={()=>{void select(buildDirectQuickActionPrompt(action,context,suggestion));}}>{suggestion}</button>)}
      </div>
      <p>Você revisa antes de qualquer geração com custo, publicação, agendamento ou campanha.</p>
    </section>}
    {error && <p role="alert">{error}</p>}
  </>;
}
