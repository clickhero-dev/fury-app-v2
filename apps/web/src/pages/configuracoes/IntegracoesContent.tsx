import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, ExternalLink } from 'lucide-react';
import { EmptyState, LoadingSpinner, Button, StatusBadge } from '@/components';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { MetaConnection } from '@/types/meta';

interface MetaAuthUrlResponse {
  success: boolean;
  data: { authUrl: string };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
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

function ConnectionCard({
  connection,
  onDisconnect,
  isDeleting,
  onSelectAccount,
  isSelectingAccount,
  onReconnect,
  isReconnecting,
}: {
  connection: MetaConnection;
  onDisconnect: (id: string) => void;
  isDeleting: boolean;
  onSelectAccount: (connectionId: string, adAccountId: string) => void;
  isSelectingAccount: boolean;
  onReconnect: () => void;
  isReconnecting: boolean;
}) {
  const tokenValid = isTokenValid(connection.tokenExpiresAt);
  const activeAdAccounts = (connection.adAccounts ?? []).filter((a) => a.account_status === 1);

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

      {/* Active account selector */}
      {activeAdAccounts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Conta ativa para métricas
          </p>
          <div className="relative">
            <select
              value={connection.selectedAdAccountId ?? activeAdAccounts[0]?.id ?? ''}
              onChange={(e) => onSelectAccount(connection.id, e.target.value)}
              disabled={isSelectingAccount}
              className="w-full appearance-none bg-surface-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#E8631A]/30 focus:border-[#E8631A] disabled:opacity-50 cursor-pointer pr-8"
            >
              {activeAdAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} · {acc.id}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              {isSelectingAccount ? (
                <span className="w-3.5 h-3.5 border-2 border-[#E8631A]/30 border-t-[#E8631A] rounded-full animate-spin inline-block" />
              ) : (
                <svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-text-tertiary pt-2">
        <span>Conectado em {formatDate(connection.createdAt)}</span>
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

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {!tokenValid && (
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            disabled={isReconnecting}
            onClick={onReconnect}
          >
            {isReconnecting ? 'Reconectando...' : 'Reconectar'}
          </Button>
        )}
        <button
          onClick={() => onDisconnect(connection.id)}
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

function DisconnectDialog({
  open,
  accountId,
  onCancel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  accountId: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desconectar conta Meta</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja desconectar a conta Meta{' '}
            <span className="font-semibold text-text-primary">{accountId}</span>? Esta ação não
            pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              Cancelar
            </button>
          </DialogClose>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Desconectando...' : 'Desconectar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IntegracoesContent() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<{ id: string; accountId: string } | null>(null);

  function showToast(message: string, variant: 'success' | 'error' = 'success') {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'oauth_cancelled') {
      showToast('Conexão com o Meta cancelada ou expirada. Tente novamente.', 'error');
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      const response = await api.get<MetaAuthUrlResponse>('/meta/auth/url', {
        params: { context: 'settings' },
      });
      return response.data.data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      await api.delete(`/meta/connections/${connectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      setPendingDisconnect(null);
    },
    onError: () => {
      setPendingDisconnect(null);
    },
  });

  const selectAccountMutation = useMutation({
    mutationFn: async ({ connectionId, adAccountId }: { connectionId: string; adAccountId: string }) => {
      await api.patch(`/meta/connections/${connectionId}/select-account`, { adAccountId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      queryClient.invalidateQueries({ queryKey: ['metrics-summary'] });
      queryClient.invalidateQueries({ queryKey: ['goals-progress-v2'] });
      queryClient.invalidateQueries({ queryKey: ['metrics-daily-week'] });
      showToast('Conta ativa atualizada');
    },
  });

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white',
            toast.variant === 'error' ? 'bg-red-600' : 'bg-[#2EA043]'
          )}
        >
          {toast.variant === 'error' ? '⚠️' : '✅'} {toast.message}
        </div>
      )}

      <DisconnectDialog
        open={!!pendingDisconnect}
        accountId={pendingDisconnect?.accountId ?? ''}
        onCancel={() => setPendingDisconnect(null)}
        onConfirm={() => pendingDisconnect && disconnectMutation.mutate(pendingDisconnect.id)}
        isPending={disconnectMutation.isPending}
      />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Contas Meta Conectadas</h3>
          <p className="text-sm text-text-secondary mt-0.5">
            Gerencie suas contas de anúncios conectadas
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => connectMutation.mutate()}
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
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : connections.length === 0 ? (
        <div className="border border-border rounded-xl">
          <EmptyState
            title="Conecte sua conta Meta para começar"
            description="Integre sua conta Meta para gerenciar campanhas e acessar insights diretamente do FURY"
            action={{
              label: 'Conectar conta Meta',
              onClick: () => connectMutation.mutate(),
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              onDisconnect={(id) => {
                const conn = connections.find((c) => c.id === id);
                setPendingDisconnect({ id, accountId: conn?.metaUserId ?? id });
              }}
              isDeleting={
                disconnectMutation.isPending && disconnectMutation.variables === connection.id
              }
              onSelectAccount={(connectionId, adAccountId) =>
                selectAccountMutation.mutate({ connectionId, adAccountId })
              }
              isSelectingAccount={
                selectAccountMutation.isPending &&
                selectAccountMutation.variables?.connectionId === connection.id
              }
              onReconnect={() => connectMutation.mutate()}
              isReconnecting={connectMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
