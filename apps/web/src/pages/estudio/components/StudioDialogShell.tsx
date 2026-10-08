import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Moldura de modal do Estúdio: fundo e conteúdo no MESMO portal (padrão dos
 * modais do Planejador). O overlay solto do Dialog padrão vira branco no modo
 * claro (regra global em `body > div`); `ady-decor` livra os textos do cinza forçado.
 */
export function StudioDialogShell({ open, onClose, className = 'max-w-lg', children }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <div className="ady-decor fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/50 p-4">
          <DialogPrimitive.Content
            className={`relative grid max-h-[calc(100vh-2rem)] w-full gap-4 overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-text-primary shadow-2xl ${className}`}
          >
            {children}
            <DialogPrimitive.Close
              className="ady-btn absolute right-4 top-4 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
