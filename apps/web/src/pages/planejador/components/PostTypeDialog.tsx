import { CalendarClock, Send, X } from 'lucide-react';

interface Props {
  onSelect: (mode: 'schedule' | 'now') => void;
  onClose: () => void;
}

export function PostTypeDialog({ onSelect, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-lg font-bold text-text-primary">Novo post</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="px-6 pb-5 text-sm text-text-secondary">Como deseja publicar este conteúdo?</p>

        <div className="px-6 pb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => onSelect('schedule')}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border hover:border-accent/50 hover:bg-accent/5 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <CalendarClock className="h-6 w-6 text-accent" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-primary">Agendar</p>
              <p className="text-xs text-text-tertiary mt-0.5">Escolha data e hora</p>
            </div>
          </button>

          <button
            onClick={() => onSelect('now')}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border border-border hover:border-green-500/50 hover:bg-green-500/5 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
              <Send className="h-6 w-6 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-text-primary">Postar agora</p>
              <p className="text-xs text-text-tertiary mt-0.5">Publica imediatamente</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
