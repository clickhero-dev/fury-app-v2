import { useState } from 'react';
import { CalendarDays, Image, Megaphone, Video } from 'lucide-react';

const actions = [
  { label: 'Criar post para o Instagram', question: 'Qual é o tema do post e para qual público?', prompt: 'Quero criar um post para o Instagram.', icon: Image },
  { label: 'Agendar posts da semana', question: 'Qual semana e quais conteúdos você quer agendar?', prompt: 'Quero agendar os posts da semana. Confirme datas, horários e fuso antes de propor agendamentos.', icon: CalendarDays },
  { label: 'Criar Reels para o Instagram', question: 'Qual é o tema e o objetivo do Reels?', prompt: 'Quero criar um Reels para o Instagram em formato vertical.', icon: Video },
  { label: 'Criar vídeo para o negócio', question: 'O que seu vídeo deve apresentar sobre o negócio?', prompt: 'Quero criar um vídeo para meu negócio. Ofereça a opção de publicar no Instagram somente após revisar o vídeo.', icon: Video },
  { label: 'Aumentar seguidores no Instagram', question: 'Qual perfil você quer divulgar e qual público deseja alcançar?', prompt: 'Quero criar uma campanha para aumentar seguidores no Instagram. Verifique os objetivos suportados e explique limitações; não prometa seguidores.', icon: Megaphone },
  { label: 'Atrair clientes pelo WhatsApp', question: 'Qual oferta e qual público você quer atrair pelo WhatsApp?', prompt: 'Quero criar uma campanha para atrair novos clientes pelo WhatsApp. Confirme o número e os recursos conectados necessários.', icon: Megaphone },
];
const safeguards = 'Continue este fluxo guiado com uma pergunta por vez. Solicite campos faltantes, conta conectada, permissões e orçamento quando aplicável. Sem integração ou permissão, explique como conectar e não simule sucesso. Reutilize as ferramentas existentes e apresente revisão e confirmação explícita antes de gerar com custo, agendar, publicar ou criar campanha. Esta solicitação não autoriza executar essas ações.';

export function ChatQuickActions({ onSelect, disabled = false }: { onSelect: (prompt: string) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState<(typeof actions)[number] | null>(null);
  const [answer, setAnswer] = useState('');
  if (selected) return <form className="ady-chat-action-start" onSubmit={event => {
    event.preventDefault();
    if (!disabled && answer.trim()) onSelect(`${selected.prompt}\n${selected.question}\n${answer.trim()}\n${safeguards}`);
  }}>
    <h2>{selected.label}</h2>
    <label htmlFor="chat-action-answer">{selected.question}</label>
    <textarea id="chat-action-answer" value={answer} onChange={event => setAnswer(event.target.value)} maxLength={4000} disabled={disabled}/>
    <p>Você revisará e confirmará qualquer geração com custo, publicação, agendamento ou campanha. Contas e permissões serão verificadas no fluxo.</p>
    <div><button type="button" disabled={disabled} onClick={() => { setSelected(null); setAnswer(''); }}>Cancelar</button>
    <button type="submit" disabled={disabled || !answer.trim()}>Continuar com Ady</button></div>
  </form>;
  return <div className="ady-chat-quick" role="group" aria-label="Ações para começar">
    {actions.map(action => <button key={action.label} type="button" disabled={disabled} onClick={() => setSelected(action)}>
      <action.icon size={18} aria-hidden="true"/> {action.label}
    </button>)}
  </div>;
}
