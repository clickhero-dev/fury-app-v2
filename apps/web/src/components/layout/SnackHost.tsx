import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { onSnackChange, type Snack } from '@/lib/snack';

/**
 * Renderiza o snack global (top-right, auto-dismiss). Montado no
 * AuthenticatedShell — fora das rotas — para sobreviver à navegação.
 */
export function SnackHost() {
  const [snack, setSnack] = useState<Snack | null>(null);

  useEffect(() => onSnackChange(setSnack), []);

  if (!snack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      key={snack.id}
      className={cn(
        'fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-xs',
        snack.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
      )}
    >
      {snack.type === 'success' ? '✅' : '⚠️'} {snack.message}
    </div>
  );
}