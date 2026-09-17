import { clsx } from 'clsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useContentAreaCenterOffset } from '@/hooks/useContentAreaCenterOffset';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

/** Confirmação de arquivamento — mesmo padrão do DeleteConfirmDialog do Planejador. */
export function ArchiveConfirmDialog({ onConfirm, onClose, loading }: Props) {
  const centerOffset = useContentAreaCenterOffset();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-xl" style={{ left: `calc(50% + ${centerOffset}px)` }}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl">Arquivar este criativo?</DialogTitle>
          <DialogDescription className="text-base">
            O criativo e todo o histórico de versões vão pra Arquivados — você pode restaurar quando quiser.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-surface-secondary hover:bg-border text-text-primary text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              loading ? 'bg-error/60 cursor-not-allowed' : 'bg-error hover:bg-error/80',
            )}
          >
            {loading ? 'Arquivando...' : 'Arquivar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
