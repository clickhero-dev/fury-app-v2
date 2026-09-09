import { useState } from 'react';
import { ExternalLink, CircleCheck, PlugZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GoogleConnection } from '@/types/google';

const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-300';

type ConnectionState = 'not_connected' | 'connected' | 'missing_scope';

function deriveState(connection: GoogleConnection | null | undefined): ConnectionState {
  if (!connection?.connected) return 'not_connected';
  return connection.adsConnected ? 'connected' : 'missing_scope';
}

interface GoogleAdsConnectionCardProps {
  connection: GoogleConnection | null | undefined;
  onConnect: (authUrl: string) => void;
  loadingAuthUrl?: boolean;
}

/**
 * Card de conexão da conta Google Ads (Fluxo 3).
 * Estados: não conectado / conectado / conectado sem escopo adwords (fallback
 * em Integrações — reautentica com prompt=consent para adicionar o escopo).
 */
export function GoogleAdsConnectionCard({
  connection,
  onConnect,
  loadingAuthUrl,
}: GoogleAdsConnectionCardProps) {
  const [localState] = useState<ConnectionState>(deriveState(connection));
  const state: ConnectionState = connection ? deriveState(connection) : localState;

  if (state === 'connected') {
    return (
      <div className={`${SURFACE_CARD} flex items-center gap-3`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <CircleCheck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">Google Ads conectado</h3>
          <p className="text-xs text-text-tertiary">
            Sua conta de anúncios está pronta para promover o perfil.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'missing_scope') {
    return (
      <div className={`${SURFACE_CARD} flex items-center gap-3`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
          <PlugZap className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-text-primary">Falta conectar o Google Ads</h3>
          <p className="text-xs text-text-tertiary">
            Autorize o acesso à sua conta de anúncios para promover o perfil.
          </p>
          <button
            type="button"
            onClick={() => onConnect('')}
            disabled={loadingAuthUrl}
            className={cn(
              'mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white cursor-pointer transition-all duration-200',
              'hover:scale-[1.02] active:scale-[0.98]',
              loadingAuthUrl && 'opacity-50'
            )}
          >
            {loadingAuthUrl ? 'Redirecionando…' : 'Conectar Google Ads'}
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${SURFACE_CARD} flex items-center gap-3`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <PlugZap className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-sm font-semibold text-text-primary">Google Ads</h3>
        <p className="text-xs text-text-tertiary">
          Conecte sua conta Google para criar a campanha de promoção do perfil.
        </p>
      </div>
    </div>
  );
}