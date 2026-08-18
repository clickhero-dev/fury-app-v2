import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout, ErrorBoundary, PageHeader, LoadingSpinner } from '@/components';
import { cn } from '@/lib/utils';
import { useGoogleSettings } from '@/hooks/useGoogleSettings';
import { GoogleConnectionCard } from './components/GoogleConnectionCard';
import { ProfileLookupResult } from './components/ProfileLookupResult';
import { BusinessProfileForm } from './components/BusinessProfileForm';
import { ProfileStatusPanel } from './components/ProfileStatusPanel';
import {
  useGoogleConnection,
  useGoogleLookup,
  useGoogleConnect,
  useGoogleDisconnect,
  useCreateProfile,
  useVerification,
  useCompleteVerification,
  useGoogleProfile,
  useSyncProfile,
  useSyncLogs,
} from './useGoogleMeuNegocio';
import type { GoogleCompleteVerificationInput, GoogleCreateProfileResult } from '@/types/google';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Conexão com o Google cancelada ou expirada. Tente novamente.',
  invalid_state: 'A autorização expirou ou é inválida. Tente conectar novamente.',
  token_exchange_failed: 'Não foi possível concluir a conexão com o Google. Tente novamente.',
};

function errorMessage(err: unknown): string {
  const axiosErr = err as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return (
    axiosErr.response?.data?.error?.message ??
    axiosErr.message ??
    'Não foi possível concluir a operação. Tente novamente.'
  );
}

function GoogleMeuNegocioContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [createdProfile, setCreatedProfile] = useState<GoogleCreateProfileResult | null>(null);

  const { data: connection, isLoading: connectionLoading } = useGoogleConnection();
  const { data: lookup, isLoading: lookupLoading, isError: lookupError } = useGoogleLookup(!!connection);
  const { data: settings } = useGoogleSettings();
  const connectMutation = useGoogleConnect();
  const disconnectMutation = useGoogleDisconnect();
  const createMutation = useCreateProfile();
  const { data: verification, isLoading: verificationLoading } = useVerification(
    createdProfile?.id ?? null,
    !!createdProfile
  );
  const completeMutation = useCompleteVerification();
  const { data: profile, isLoading: profileLoading } = useGoogleProfile(
    createdProfile?.id ?? null,
    !!createdProfile
  );
  const syncMutation = useSyncProfile();
  const { data: syncLogs, isLoading: syncLogsLoading } = useSyncLogs(
    createdProfile?.id ?? null,
    !!createdProfile
  );

  const settingsComplete = Boolean(
    settings?.name?.trim() &&
      settings?.phone?.trim() &&
      (settings?.address?.street?.trim() || settings?.address?.city?.trim())
  );

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

  function handleCreateProfile() {
    createMutation.mutate(undefined, {
      onSuccess: (data) => {
        setCreatedProfile(data);
        showToast('Perfil criado no Google. Aguardando verificação.');
      },
      onError: (err) => {
        showToast(errorMessage(err), 'error');
      },
    });
  }

  function handleCompleteVerification(method: GoogleCompleteVerificationInput['method']) {
    if (!createdProfile) return;
    completeMutation.mutate(
      { profileId: createdProfile.id, method },
      {
        onSuccess: (result) => {
          if (result.syncStatus === 'verified') {
            setCreatedProfile(null);
            showToast('Perfil verificado pelo Google.');
          } else if (result.postalGuidance) {
            showToast('Cartão postal enviado. Siga as instruções para concluir a verificação.');
          } else if (result.awaitingPin) {
            showToast('PIN enviado. Confira seu telefone ou email e conclua a verificação no Google.');
          }
        },
        onError: (err) => {
          showToast(errorMessage(err), 'error');
        },
      }
    );
  }

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
        settingsComplete={settingsComplete}
        createdProfile={createdProfile}
        isCreating={createMutation.isPending}
        onCreate={handleCreateProfile}
        verification={verification}
        isVerificationLoading={verificationLoading}
        onComplete={handleCompleteVerification}
        isCompleting={completeMutation.isPending}
      />

      {createdProfile && !profileLoading && profile && (
        <ProfileStatusPanel
          profile={profile}
          syncLogs={syncLogs}
          isSyncing={syncLogsLoading || syncMutation.isPending}
          onSync={() =>
            syncMutation.mutate(createdProfile.id, {
              onSuccess: (synced) => {
                if (synced.syncStatus === 'verified') {
                  setCreatedProfile(null);
                  showToast('Perfil sincronizado e verificado pelo Google.');
                } else {
                  showToast('Perfil sincronizado com sucesso.');
                }
              },
              onError: (err) => showToast(errorMessage(err), 'error'),
            })
          }
        />
      )}

      <BusinessProfileForm
        onSaved={() => showToast('Dados do negócio salvos com sucesso.')}
        onError={(message) => showToast(message, 'error')}
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