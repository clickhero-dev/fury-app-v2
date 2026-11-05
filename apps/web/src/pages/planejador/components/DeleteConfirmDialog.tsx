import { clsx } from 'clsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface Props {
  count: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

export function DeleteConfirmDialog({ count, onConfirm, onClose, loading }: Props) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Fecha por Escape / clique no overlay / botão X. Bloqueado enquanto
        // a exclusão está em andamento para evitar fechamento duplo.
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>
            Excluir {count} post{count > 1 ? 's' : ''}?
          </DialogTitle>
          <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-secondary hover:bg-border text-text-primary text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              loading ? 'bg-error/60 cursor-not-allowed' : 'bg-error hover:bg-error/80',
            )}
          >
            {loading ? 'Excluindo...' : 'Excluir'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}