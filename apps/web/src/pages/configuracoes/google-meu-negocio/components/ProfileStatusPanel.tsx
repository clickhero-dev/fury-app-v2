import { Activity, CheckCircle2, Clock, Hourglass, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GoogleBusinessProfile, GoogleSyncLogsResult } from '@/types/google';

const SURFACE = 'rounded-2xl border border-border bg-surface p-6 shadow-sm';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

interface StatusConfig {
  label: string;
  icon: typeof Clock;
  className: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  not_connected: { label: 'Não conectado', icon: XCircle, className: 'bg-text-tertiary/10 text-text-tertiary' },
  connected: { label: 'Conectado', icon: Activity, className: 'bg-brand/10 text-brand' },
  no_profile: { label: 'Sem perfil', icon: XCircle, className: 'bg-text-tertiary/10 text-text-tertiary' },
  awaiting_verification: { label: 'Aguardando verificação', icon: Hourglass, className: 'bg-warning/10 text-warning' },
  verified: { label: 'Verificado', icon: ShieldCheck, className: 'bg-brand/10 text-brand' },
  syncing: { label: 'Sincronizando', icon: Loader2, className: 'bg-warning/10 text-warning' },
  synced: { label: 'Sincronizado', icon: CheckCircle2, className: 'bg-brand/10 text-brand' },
  error: { label: 'Erro', icon: XCircle, className: 'bg-error/10 text-error' },
};

const OPERATION_LABELS: Record<string, string> = {
  oauth_connect: 'Conexão com o Google',
  lookup: 'Busca de perfil',
  create: 'Criação de perfil',
  update: 'Atualização de perfil',
  verify: 'Verificação',
  sync: 'Sincronização',
  error: 'Erro',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  success: 'Sucesso',
  failed: 'Falhou',
};

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Nunca';
  return new Date(dateString).toLocaleString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProfileStatusPanel({
  profile,
  syncLogs,
  isSyncing,
  onSync,
}: {
  profile: GoogleBusinessProfile;
  syncLogs: GoogleSyncLogsResult | null;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const config = STATUS_CONFIG[profile.syncStatus] ?? STATUS_CONFIG.error;
  const StatusIcon = config.icon;

  return (
    <div className={`${SURFACE} space-y-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-text-primary">Status do perfil</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                config.className
              )}
            >
              <StatusIcon className={cn('h-3.5 w-3.5', profile.syncStatus === 'syncing' && 'animate-spin')} />
              {config.label}
            </span>
          </div>
          <p className="text-xs text-text-tertiary">
            Última sincronização: <span className="font-medium text-text-primary">{formatDate(profile.lastSyncedAt)}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-text-primary hover:bg-surface-secondary cursor-pointer',
            BUTTON_HOVER,
            isSyncing && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSyncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand" />
          <h4 className="text-sm font-semibold text-text-primary">Histórico</h4>
        </div>

        {syncLogs && syncLogs.logs.length > 0 ? (
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {syncLogs.logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-xs"
              >
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    log.status === 'success' && 'bg-brand',
                    log.status === 'failed' && 'bg-error',
                    (log.status === 'pending' || log.status === 'in_progress') && 'bg-warning'
                  )}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">
                      {OPERATION_LABELS[log.operation] ?? log.operation}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-tertiary">
                      {formatDate(log.createdAt)}
                    </span>
                  </div>
                  {log.message && <p className="truncate text-text-tertiary">{log.message}</p>}
                  <span
                    className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
                      log.status === 'success' && 'bg-brand/10 text-brand',
                      log.status === 'failed' && 'bg-error/10 text-error',
                      (log.status === 'pending' || log.status === 'in_progress') &&
                        'bg-warning/10 text-warning'
                    )}
                  >
                    {STATUS_LABELS[log.status] ?? log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-surface-secondary px-3 py-4 text-center text-xs text-text-tertiary">
            Nenhuma operação de sincronização registrada ainda.
          </p>
        )}
      </div>
    </div>
  );
}