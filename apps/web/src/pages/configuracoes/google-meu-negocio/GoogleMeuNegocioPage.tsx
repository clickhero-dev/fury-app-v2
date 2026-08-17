import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout, ErrorBoundary, PageHeader, LoadingSpinner } from '@/components';
import { cn } from '@/lib/utils';
import { GoogleConnectionCard } from './components/GoogleConnectionCard';
import { ProfileLookupResult } from './components/ProfileLookupResult';
import {
  useGoogleConnection,
  useGoogleLookup,
  useGoogleConnect,
  useGoogleDisconnect,
} from './useGoogleMeuNegocio';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Conexão com o Google cancelada ou expirada. Tente novamente.',
  invalid_state: 'A autorização expirou ou é inválida. Tente conectar novamente.',
  token_exchange_failed: 'Não foi possível concluir a conexão com o Google. Tente novamente.',
};

function GoogleMeuNegocioContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const { data: connection, isLoading: connectionLoading } = useGoogleConnection();
  const { data: lookup, isLoading: lookupLoading, isError: lookupError } = useGoogleLookup(!!connection);
  const connectMutation = useGoogleConnect();
  const disconnectMutation = useGoogleDisconnect();

  function showToast(message: string, variant: 'success' | 'error' = 'success') {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'true') {
      showToast('Conta Google conectada com sucesso.');
      const next = new URLSearchParams(searchParams);
      next.delete('connected');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const error = searchParams.get('error');
    if (error && OAUTH_ERROR_MESSAGES[error]) {
      showToast(OAUTH_ERROR_MESSAGES[error], 'error');
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl px-5 py-3 text-xs font-semibold text-white shadow-lg',
            toast.variant === 'error' ? 'bg-error' : 'bg-brand'
          )}
        >
          {toast.variant === 'error' ? '⚠️' : '✅'} {toast.message}
        </div>
      )}

      <PageHeader
        title="Google Meu Negócio"
        description="Conecte sua conta Google, verifique se já existe um perfil do seu negócio e gerencie tudo pela Ady."
      />

      {connectionLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-surface px-6 py-20">
          <LoadingSpinner />
        </div>
      ) : (
        <GoogleConnectionCard
          connection={connection}
          isLoading={connectionLoading}
          onConnect={() => connectMutation.mutate('settings')}
          isConnecting={connectMutation.isPending}
          onDisconnect={(id) => disconnectMutation.mutate(id)}
          isDisconnecting={disconnectMutation.isPending}
        />
      )}

      <ProfileLookupResult
        result={lookup}
        isLoading={lookupLoading}
        isError={lookupError}
        hasConnection={!!connection}
      />
    </div>
  );
}

export function GoogleMeuNegocioPage() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <GoogleMeuNegocioContent />
      </AppLayout>
    </ErrorBoundary>
  );
}