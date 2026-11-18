import { CalendarDays, Image, Sparkles } from 'lucide-react';

const actions = [
  { label: 'Não sei o que postar', prompt: 'Não sei o que postar. Prepare meu próximo post com uma ideia e uma legenda prontas para revisar.', icon: Sparkles },
  { label: 'Organizar minha semana', prompt: 'Organize minha semana de posts com sugestões de dias, ideias e legendas para revisar, sem agendar nada.', icon: CalendarDays },
  { label: 'Usar uma foto minha', prompt: 'Prepare um post e uma legenda usando minha foto. Se não houver foto anexada, peça apenas que eu anexe a foto pelo botão Anexar arquivos.', icon: Image },
];
const safeguards = 'Use o contexto autorizado do meu negócio e desta conversa. Não faça perguntas opcionais nem exija que eu saiba de marketing. Prepare o que já for possível; pergunte apenas por um dado indispensável que esteja faltando. Não invente informações, anexos, acesso a contas ou resultados. Apresente o material para revisão e ofereça próximos passos simples usando as opções de clarify existentes quando disponíveis. Este pedido não autoriza publicar, agendar, investir em mídia paga ou gerar mídia com custo; essas ações exigem revisão e confirmação explícita separada.';

export function ChatQuickActions({ onSelect, disabled = false }: { onSelect: (prompt: string) => void; disabled?: boolean }) {
  return <div className="ady-chat-quick" role="group" aria-label="Ações para começar">
    {actions.map((action, index) => <button key={action.label} className={index === 0 ? 'ady-chat-quick-primary' : undefined} type="button" disabled={disabled} onClick={() => onSelect(`${action.prompt}\n${safeguards}`)}>
      <action.icon size={18} aria-hidden="true"/> {action.label}
    </button>)}
  </div>;
}
