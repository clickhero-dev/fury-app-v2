import { clsx } from 'clsx';

interface Props {
  count: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

export function DeleteConfirmDialog({ count, onConfirm, onClose, loading }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text-primary mb-2">
          Excluir {count} post{count > 1 ? 's' : ''}?
        </h3>
        <p className="text-sm text-text-secondary mb-4">Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-surface-secondary hover:bg-border text-text-primary text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors',
              loading ? 'bg-error/60 cursor-not-allowed' : 'bg-error hover:bg-error/80',
            )}
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
