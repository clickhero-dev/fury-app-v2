import { AlertTriangle, Building2, CheckCircle2, Hourglass, Loader2, MapPin, Phone, Plus, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  GoogleCreateProfileResult,
  GoogleLookupResult,
  GoogleVerificationResult,
} from '@/types/google';

const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

function formatVerificationState(state: string): string {
  if (state === 'VERIFIED') return 'Verificado pelo Google';
  return 'Não verificado';
}

function MatchList({ matches }: { matches: GoogleLookupResult['matches'] }) {
  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <div
          key={match.gbpLocationId}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-secondary p-4 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-text-tertiary" />
              <span className="font-semibold text-text-primary">{match.name}</span>
            </div>
            <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 font-medium text-brand">
              confiança {match.confidence.toLowerCase()}
            </span>
          </div>
          <div className="grid gap-1 text-text-tertiary sm:grid-cols-2">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {[match.address.street, match.address.city, match.address.state]
                .filter(Boolean)
                .join(', ') || '—'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              {match.phone || '—'}
            </span>
          </div>
          <span className="text-text-tertiary">
            {formatVerificationState(match.verificationState)}
            {match.claimed ? ' · vinculado à sua conta' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function AwaitingVerificationPanel({
  profile,
  verification,
  isLoading,
  onComplete,
  isCompleting,
}: {
  profile: GoogleCreateProfileResult;
  verification: GoogleVerificationResult | null;
  isLoading: boolean;
  onComplete: (method: 'POSTAL' | 'PHONE' | 'EMAIL') => void;
  isCompleting: boolean;
}) {
  const instructions = verification?.instructions ?? profile.verificationInstructions;

  return (
    <div className={`${SURFACE} space-y-4 p-6`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-text-primary">
            Perfil criado · aguardando verificação
          </h3>
          <p className="text-xs text-text-tertiary">
            Seu perfil <span className="font-medium text-text-primary">{profile.name}</span> foi criado
            no Google. Conclua a verificação para que o perfil fique ativo.
          </p>
        </div>
      </div>

      {instructions && (
        <p className="rounded-xl border border-border bg-surface-secondary px-3 py-2 text-xs text-text-tertiary">
          {instructions}
        </p>
      )}

      {isLoading ? (
        <p className="inline-flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando opções de verificação...
        </p>
      ) : verification && verification.options.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-primary">Como você quer verificar o perfil?</p>
          {verification.options.map((option) => (
            <button
              key={option.method}
              type="button"
              onClick={() => onComplete(option.method)}
              disabled={isCompleting}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-left text-xs text-text-primary transition hover:border-brand cursor-pointer',
                isCompleting && 'opacity-60'
              )}
            >
              <span>{option.description}</span>
              {isCompleting ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
              ) : (
                <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand">
                  {option.method}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">
          Acompanhe o status da verificação diretamente no Google Meu Negócio.
        </p>
      )}
    </div>
  );
}

export function ProfileLookupResult({
  result,
  isLoading,
  isError,
  hasConnection,
  settingsComplete,
  createdProfile,
  isCreating,
  onCreate,
  verification,
  isVerificationLoading,
  onComplete,
  isCompleting,
}: {
  result: GoogleLookupResult | null;
  isLoading: boolean;
  isError: boolean;
  hasConnection: boolean;
  settingsComplete: boolean;
  createdProfile: GoogleCreateProfileResult | null;
  isCreating: boolean;
  onCreate: () => void;
  verification: GoogleVerificationResult | null;
  isVerificationLoading: boolean;
  onComplete: (method: 'POSTAL' | 'PHONE' | 'EMAIL') => void;
  isCompleting: boolean;
}) {
  if (!hasConnection) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`${SURFACE} flex items-center justify-center gap-3 px-6 py-12`}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        <p className="text-sm text-text-tertiary">Verificando se já existe um perfil no Google...</p>
      </div>
    );
  }

  if (isError || !result) {
    return (
      <div className={`${SURFACE} flex items-start gap-3 border-error/40 bg-error/10 p-5`}>
        <AlertTriangle className="h-5 w-5 shrink-0 text-error" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-text-primary">Não foi possível verificar o perfil</h3>
          <p className="text-xs text-text-tertiary">
            Sua conexão com o Google pode ter expirado. Reconecte sua conta e tente novamente.
          </p>
        </div>
      </div>
    );
  }

  if (createdProfile) {
    return (
      <AwaitingVerificationPanel
        profile={createdProfile}
        verification={verification}
        isLoading={isVerificationLoading}
        onComplete={onComplete}
        isCompleting={isCompleting}
      />
    );
  }

  if (result.found) {
    return (
      <div className={`${SURFACE} space-y-4 p-6`}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">Perfil encontrado no Google</h3>
            <p className="text-xs text-text-tertiary">
              Já existe um perfil do seu negócio vinculado à sua conta Google. Você poderá gerenciá-lo
              pela Ady.
            </p>
          </div>
        </div>
        <MatchList matches={result.matches} />
      </div>
    );
  }

  if (result.duplicateAlert) {
    return (
      <div className={`${SURFACE} space-y-4 border-warning/40 bg-warning/10 p-6`}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">Perfil duplicado encontrado</h3>
            <p className="text-xs text-text-tertiary">
              Já existe um perfil para este negócio no Google, mas ele não está vinculado à sua conta.
              Reivindique o perfil em vez de criar um novo para não perder avaliações e informações.
            </p>
          </div>
        </div>
        <MatchList matches={result.matches} />
        <button
          type="button"
          disabled
          title="Disponível na próxima etapa"
          className="inline-flex items-center gap-2 rounded-full border border-warning/40 px-4 py-2 text-xs font-semibold text-warning opacity-60 cursor-not-allowed"
        >
          Reivindicar perfil
        </button>
        <p className="text-[11px] text-text-tertiary">A reivindicação será habilitada em breve.</p>
      </div>
    );
  }

  return (
    <div className={`${SURFACE} space-y-4 p-6`}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-brand">
          <SearchX className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-text-primary">Nenhum perfil encontrado</h3>
          <p className="text-xs text-text-tertiary">
            Não encontramos um perfil do seu negócio no Google. Você pode criar um novo perfil a partir
            dos dados do seu negócio.
          </p>
        </div>
      </div>

      {settingsComplete ? (
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white cursor-pointer',
            BUTTON_HOVER,
            isCreating && 'opacity-50'
          )}
        >
          {isCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {isCreating ? 'Criando perfil...' : 'Criar perfil'}
        </button>
      ) : (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-text-primary">
          Preencha os dados do negócio (nome, endereço e telefone) para habilitar a criação do perfil.
        </p>
      )}
    </div>
  );
}