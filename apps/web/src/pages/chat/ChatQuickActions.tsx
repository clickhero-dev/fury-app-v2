import { CalendarDays, Image, Megaphone, Video } from 'lucide-react';

const actions = [
  { label: 'Planejar postagens do mês', prompt: 'Quero planejar as postagens do mês', icon: CalendarDays },
  { label: 'Criar campanha', prompt: 'Quero criar uma campanha paga ou orgânica', icon: Megaphone },
  { label: 'Criar vídeos', prompt: 'Quero criar um vídeo', icon: Video },
  { label: 'Criar imagens', prompt: 'Quero criar uma imagem', icon: Image },
];

export function ChatQuickActions({ onSelect, disabled = false }: { onSelect: (prompt: string) => void; disabled?: boolean }) {
  return <div className="ady-chat-quick" role="group" aria-label="Sugestões para começar">
    {actions.map(({ label, prompt, icon: Icon }) => <button key={label} type="button" disabled={disabled} onClick={() => onSelect(prompt)}>
      <Icon size={18} aria-hidden="true"/> {label}
    </button>)}
  </div>;
}
