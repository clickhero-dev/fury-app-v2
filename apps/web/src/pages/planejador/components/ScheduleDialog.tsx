import { useState } from 'react';
import { clsx } from 'clsx';

interface Props {
  count: number;
  onConfirm: (scheduledAt: string) => void;
  onClose: () => void;
}

export function ScheduleDialog({ count, onConfirm, onClose }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const dateTime = date && time ? new Date(`${date}T${time}`).toISOString() : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text-primary mb-4">
          Agendar {count} post{count > 1 ? 's' : ''}
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Hora</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:border-accent focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-secondary hover:bg-border text-text-primary text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => dateTime && onConfirm(dateTime)}
            disabled={!dateTime}
            className={clsx(
              'px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors',
              dateTime ? 'bg-accent hover:bg-accent-light' : 'bg-surface-secondary text-text-tertiary cursor-not-allowed',
            )}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
