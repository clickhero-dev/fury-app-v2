import { Link, useNavigate } from 'react-router-dom';
import { AppLayout, ErrorBoundary, PageHeader, LoadingSpinner } from '@/components';
import { ConnectionTab } from './components/ConnectionTab';
import { OwnerPanel } from './components/OwnerPanel';
import { useGoogleConnection, useGoogleLookup } from './useGoogleMeuNegocio';

// Conexão e dados (acessada por Integrações; retorno do OAuth cai aqui)
const GMN_CONNECTION_PATH = '/configuracoes/google-meu-negocio';

// Ações que, por enquanto, levam à tela de conexão e dados (painéis próprios na Fase 3)
const CONNECTION_ACTIONS = new Set(['connection', 'edit_profile', 'photos', 'ads', 'profiles']);

// Mensagem do erro do Google em pt-BR (permissão, quota ou genérico)
function lookupErrorMessage(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response;
  const message = response?.data?.error?.message ?? '';
  if (/insufficient authentication scopes/i.test(message)) {
    return 'Sua conexão com o Google não tem permissão para gerenciar o Perfil da Empresa. Reconecte a conta em Integrações e marque essa permissão na tela do Google.';
  }
  if (response?.status === 429 || /quota|resource exhausted/i.test(message)) {
    return 'O Google atingiu o limite de uso (quota). Tente novamente em alguns minutos.';
  }
  return message ? `O Google recusou a consulta: ${message}` : 'Não foi possível consultar o Google agora.';
}

function LookupError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 px-6 py-10 text-center">
      <p className="text-sm text-text-primary">{lookupErrorMessage(error)}</p>
      <div className="flex justify-center gap-4">
        <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={onRetry}>
          Tentar novamente
        </button>
        <Link to={GMN_CONNECTION_PATH} className="text-sm font-semibold text-brand hover:underline">
          Ir para Conexão e dados
        </Link>
      </div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm text-text-secondary">{message}</p>
      <Link to={GMN_CONNECTION_PATH} className="text-sm font-semibold text-brand hover:underline">
        Ir para Conexão e dados
      </Link>
    </div>
  );
}

function GoogleMeuNegocioPanelContent() {
  const navigate = useNavigate();
  const { data: connection, isLoading: connectionLoading } = useGoogleConnection();
  const {
    data: lookup,
    isLoading: lookupLoading,
    isError: lookupFailed,
    error: lookupError,
    refetch: retryLookup,
  } = useGoogleLookup(!!connection);
  const profileId = lookup?.profile?.id ?? null;
  const loading = connectionLoading || (!!connection && lookupLoading);

  function handleAction(key: string) {
    if (CONNECTION_ACTIONS.has(key)) navigate(GMN_CONNECTION_PATH);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      <PageHeader title="Google Meu Negócio" description="O perfil da sua empresa no Google, gerenciado pela Ady." />

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !connection ? (
        <EmptyPanel message="Conecte sua conta Google em Integrações para ver o painel do seu perfil." />
      ) : lookupFailed ? (
        <LookupError error={lookupError} onRetry={() => void retryLookup()} />
      ) : !profileId ? (
        <EmptyPanel message="Nenhum perfil do Google vinculado ainda. Encontre ou crie o perfil da sua empresa." />
      ) : (
        <OwnerPanel profileId={profileId} onAction={handleAction} />
      )}
    </div>
  );
}

/** Tela própria do menu: painel "Sua empresa no Google". */
export function GoogleMeuNegocioPage() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <GoogleMeuNegocioPanelContent />
      </AppLayout>
    </ErrorBoundary>
  );
}

/** Conexão e dados do Google Meu Negócio (vinda de Integrações). */
export function GoogleMeuNegocioConexaoPage() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
          <PageHeader
            title="Google Meu Negócio · Conexão e dados"
            description="Conecte sua conta Google, encontre ou crie o perfil da empresa e mantenha os dados atualizados."
          />
          <ConnectionTab />
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}
