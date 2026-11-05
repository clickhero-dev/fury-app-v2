import { Info } from 'lucide-react';
import { formatLastSync } from '../lib/format-last-sync';

interface MetaSyncNoticeProps {
  firstSyncPending?: boolean;
  syncedAt?: string | null;
}

/** Faixa discreta que informa a atualização automática dos dados da Meta. */
export function MetaSyncNotice({ firstSyncPending = false, syncedAt }: MetaSyncNoticeProps) {
  if (firstSyncPending) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-xs leading-5">Estamos preparando seus dados. Eles aparecerão aqui automaticamente.</p>
      </div>
    );
  }

  const lastSync = formatLastSync(syncedAt);
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-xs leading-5">
        <p className="font-semibold">Estamos consultando seus dados na Meta</p>
        <p className="text-sky-700/90 dark:text-sky-100/80">A atualização está levando um pouco mais de tempo. Por enquanto, exibimos os últimos dados disponíveis.</p>
        {lastSync && <p className="text-sky-700/80 dark:text-sky-100/70">Última atualização: {lastSync} · Os novos dados aparecerão automaticamente.</p>}
      </div>
    </div>
  );
}
