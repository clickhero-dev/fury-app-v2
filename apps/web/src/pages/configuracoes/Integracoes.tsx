import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, ExternalLink } from 'lucide-react';
import { AppLayout, PageHeader, EmptyState, LoadingSpinner, Button, StatusBadge, ErrorBoundary } from '@/components';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { MetaConnection } from '@/types/meta';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaAuthUrlResponse {
  success: boolean;
  data: { authUrl: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isTokenValid(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt) > new Date();
}

function getTokenStatus(valid: boolean): 'active' | 'paused' {
  return valid ? 'active' : 'paused';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConnectionCard({
  connection,
  onDisconnect,
  isDeleting,
}: {
  connection: MetaConnection;
  onDisconnect: (id: string) => void;
  isDeleting: boolean;
}) {
  const tokenValid = isTokenValid(connection.tokenExpiresAt);

  const handleDisconnect = () => {
    const message = `Tem certeza que deseja desconectar a conta Meta "${connection.metaUserId}"? Esta ação não pode ser desfeita.`;
    if (window.confirm(message)) {
      onDisconnect(connection.id);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text-primary text-base line-clamp-1">
            Conta Meta · {connection.metaUserId}
          </h3>
        </div>
        <StatusBadge status={getTokenStatus(tokenValid)} />
      </div>

      {/* Ad Accounts */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Contas de Anúncios ({(connection.adAccounts ?? []).length})
        </p>
        <div className="space-y-1.5">
          {(connection.adAccounts ?? []).map((adAccount) => (
            <div
              key={adAccount.id}
              className="flex items-center justify-between gap-3 p-3 bg-surface-secondary rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary line-clamp-1">
                  {adAccount.name}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">{adAccount.id}</p>
              </div>
              <div
                className={cn(
                  'flex-shrink-0 w-2 h-2 rounded-full',
                  adAccount.account_status === 1 ? 'bg-success' : 'bg-gray-300'
                )}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Token Status */}
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg text-sm',
          tokenValid ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
        )}
      >
        <span className="text-lg">{tokenValid ? '✅' : '⚠️'}</span>
        <div>
          <p className="font-semibold text-xs">
            {tokenValid ? 'Token válido' : 'Token expirado'}
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {connection.tokenExpiresAt
              ? `${tokenValid ? 'Expira em' : 'Expirou em'} ${formatDate(connection.tokenExpiresAt)}`
              : 'Validade desconhecida'}
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-text-tertiary pt-2">
        <span>Conectado em {formatDate(connection.createdAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {!tokenValid && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-[#E8631A] text-[#E8631A] hover:bg-[#FEF0E7]"
          >
            Renovar token
          </Button>
        )}
        <button
          onClick={handleDisconnect}
          disabled={isDeleting}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all',
            isDeleting
              ? 'bg-error-light text-error opacity-50 cursor-not-allowed'
              : 'border border-error text-error hover:bg-error-light'
          )}
        >
          <LogOut className="w-4 h-4" />
          {isDeleting ? 'Desconectando...' : 'Desconectar'}
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Integracoes() {
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery<MetaConnection[]>({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      try {
        const response = await api.get<{ success: boolean; data: MetaConnection[] }>('/meta/connections');
        return Array.isArray(response.data.data) ? response.data.data : [];
      } catch {
        return [];
      }
    },
    placeholderData: [],
    refetchOnMount: true,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await api.get<MetaAuthUrlResponse>('/meta/auth/url');
        return response.data.data.authUrl;
      } catch (error) {
        throw new Error('Falha ao obter URL de autenticação. Tente novamente.');
      }
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.delete(`/meta/connections/${connectionId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
    },
    onError: (error) => {
      console.error('Erro ao desconectar:', error);
    },
  });

  const handleAddConnection = () => {
    connectMutation.mutate();
  };

  const handleDisconnect = (connectionId: string) => {
    disconnectMutation.mutate(connectionId);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-8">
          <PageHeader
            title="Integrações"
            description="Gerencie suas contas de anúncios conectadas"
          />

          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <ErrorBoundary>
    <AppLayout>
      <div className="space-y-8">
        <PageHeader
          title="Integrações"
          description="Gerencie suas contas de anúncios conectadas"
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddConnection}
              disabled={connectMutation.isPending}
              className="flex items-center gap-2"
            >
              {connectMutation.isPending ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4" />
                  Adicionar conta Meta
                </>
              )}
            </Button>
          }
        />

        {connections.length === 0 ? (
          <div className="border border-border rounded-xl">
            <EmptyState
              title="Conecte sua conta Meta para começar"
              description="Integre sua conta Meta para gerenciar campanhas e acessar insights diretamente do FURY"
              action={{
                label: 'Conectar conta Meta',
                onClick: handleAddConnection,
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                onDisconnect={handleDisconnect}
                isDeleting={
                  disconnectMutation.isPending &&
                  disconnectMutation.variables === connection.id
                }
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
    </ErrorBoundary>
  );
}
