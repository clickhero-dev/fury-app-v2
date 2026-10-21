import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoadingSpinner } from '@/components';
import { cn } from '@/lib/utils';
import { useGoogleSettings } from '@/hooks/useGoogleSettings';
import { GoogleConnectionCard } from './GoogleConnectionCard';
import { GoogleAdsConnectionCard } from './GoogleAdsConnectionCard';
import { CampaignBudgetForm } from './CampaignBudgetForm';
import { ProfileLookupResult } from './ProfileLookupResult';
import { BusinessProfileForm } from './BusinessProfileForm';
import { ProfileStatusPanel } from './ProfileStatusPanel';
import { PhotoUploader } from './PhotoUploader';
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
  useGoogleAdsAuthUrl,
  useGoogleAdsStatus,
  useCreateGoogleAdsCampaign,
  usePauseGoogleAdsCampaign,
} from '../useGoogleMeuNegocio';
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

/** Detecta quota excedida/recurso indisponível na resposta da API do Google. */
function isQuotaExceeded(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  const status = (err as { response?: { status?: number } })?.response?.status;
  return (
    msg.includes('quota exceeded') ||
    msg.includes('quota excedida') ||
    msg.includes('resource exhausted') ||
    status === 429 ||
    (status === 403 && msg.includes('quota'))
  );
}

function QuotaWarningBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <span className="text-lg leading-none">⚠️</span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-text-primary">Google temporariamente indisponível</p>
        <p className="text-xs text-text-tertiary">
          A API do Google atingiu o limite de uso (quota). Isso costuma normalizar em alguns minutos.
          Tente novamente mais tarde.
        </p>
      </div>
    </div>
  );
}

/** Aba "Conexão e dados": conteúdo original da página, sem mudança de lógica. */
export function ConnectionTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [createdProfile, setCreatedProfile] = useState<GoogleCreateProfileResult | null>(null);

  const { data: connection, isLoading: connectionLoading } = useGoogleConnection();
  const { data: lookup, isLoading: lookupLoading, isError: lookupError, error: lookupQueryError } = useGoogleLookup(!!connection);
  const { data: settings } = useGoogleSettings();
  const connectMutation = useGoogleConnect();
  const disconnectMutation = useGoogleDisconnect();
  const createMutation = useCreateProfile();
  const completeMutation = useCompleteVerification();
  const syncMutation = useSyncProfile();
  // Perfil "ativo": o recém-criado na sessão OU o persistido no banco (pós-reload).
  const activeProfileId = createdProfile?.id ?? lookup?.profile?.id ?? null;
  const { data: verification, isLoading: verificationLoading } = useVerification(
    activeProfileId,
    !!activeProfileId
  );
  const { data: profile, isLoading: profileLoading } = useGoogleProfile(
    activeProfileId,
    !!activeProfileId
  );
  const { data: syncLogs, isLoading: syncLogsLoading } = useSyncLogs(
    activeProfileId,
    !!activeProfileId
  );
  const adsAuthQuery = useGoogleAdsAuthUrl();
  const { data: adsStatus } = useGoogleAdsStatus(activeProfileId, !!activeProfileId && connection?.adsConnected === true);
  const createAdsMutation = useCreateGoogleAdsCampaign();
  const pauseAdsMutation = usePauseGoogleAdsCampaign();

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

  function handleConnectAds() {
    adsAuthQuery.refetch().then((result) => {
      const authUrl = result.data?.authUrl;
      if (!authUrl) {
        showToast('Não foi possível gerar o link de conexão do Google Ads.', 'error');
        return;
      }
      window.location.href = authUrl;
    });
  }

  function handleCreateAdsCampaign(monthlyBudgetBRL: number) {
    if (!activeProfileId) return;
    createAdsMutation.mutate(
      { profileId: activeProfileId, monthlyBudgetBRL },
      {
        onSuccess: () => showToast('Campanha criada no Google Ads. O anúncio será ativado em breve.'),
        onError: (err) => showToast(errorMessage(err), 'error'),
      }
    );
  }

  function handlePauseAdsCampaign() {
    if (!activeProfileId) return;
    pauseAdsMutation.mutate(activeProfileId, {
      onSuccess: () => showToast('Anúncio pausado.'),
      onError: (err) => showToast(errorMessage(err), 'error'),
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
    <div className="space-y-6">
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

      {lookupError && lookupQueryError && isQuotaExceeded(lookupQueryError) && (
        <QuotaWarningBanner />
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

      <GoogleAdsConnectionCard
        connection={connection}
        onConnect={handleConnectAds}
        loadingAuthUrl={adsAuthQuery.isFetching}
      />

      {activeProfileId && profile?.verificationState === 'VERIFIED' && connection?.adsConnected && (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <CampaignBudgetForm
            onSubmit={handleCreateAdsCampaign}
            submitting={createAdsMutation.isPending}
            disabled={createAdsMutation.isPending}
          />
        </div>
      )}

      {activeProfileId && !profileLoading && profile && (
        <ProfileStatusPanel
          profile={profile}
          syncLogs={syncLogs}
          isSyncing={syncLogsLoading || syncMutation.isPending}
          adsStatus={adsStatus}
          onPauseAds={handlePauseAdsCampaign}
          pausingAds={pauseAdsMutation.isPending}
          onSync={() =>
            syncMutation.mutate(activeProfileId, {
              onSuccess: (synced) => {
                if (synced.syncStatus === 'verified') {
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

      {activeProfileId && !profileLoading && profile && (
        <PhotoUploader
          profileId={activeProfileId}
          photos={profile.photos}
          onPhotosChange={(photos) => {
            // O query cache é invalidado automaticamente pelo hook
          }}
        />
      )}

      <BusinessProfileForm
        onSaved={() => showToast('Dados do negócio salvos com sucesso.')}
        onError={(message) => showToast(message, 'error')}
      />
    </div>
  );
}
