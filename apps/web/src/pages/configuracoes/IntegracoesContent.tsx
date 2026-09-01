import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Plus, RefreshCw } from 'lucide-react';
import { LoadingSpinner, PageHeader } from '@/components';
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
// Google Meu Negócio oculto (feature incompleta) — 2026-09
// import { GoogleIntegrationCard } from './GoogleIntegrationCard';

interface MetaAuthUrlResponse {
  success: boolean;
  data: { authUrl: string };
}

/* ── Estilos de Design Alinhados com o System ── */
const SURFACE = 'rounded-2xl border border-border bg-surface shadow-sm';
const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 shadow-sm hover:border-border-light transition-all duration-300';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isTokenValid(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return true;
  return new Date(tokenExpiresAt) > new Date();
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
  const totalAccounts = (connection.adAccounts ?? []).length;

  return (
    <div className={`${SURFACE_CARD} flex flex-col justify-between space-y-6`}>
      <div className="space-y-4">
        {/* Header do Card com Status */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Conta Meta · {connection.metaUserId}
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              Conectado em {formatDate(connection.createdAt)}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              tokenValid
                ? 'bg-brand/10 text-[#17708A] dark:text-[#2A9BC0]'
                : 'bg-warning/10 text-warning'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                tokenValid ? 'bg-brand' : 'bg-warning'
              )}
            />
            {tokenValid ? 'Ativa' : 'Pausada'}
          </span>
        </div>

        {/* Quantidade de Contas de Anúncios */}
        <div className="pt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Contas de Anúncios ({totalAccounts})
        </div>

        {/* Seleção de Conta Ativa para métricas */}
        {activeAdAccounts.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <label
              htmlFor={`ad-account-select-${connection.id}`}
              className="block text-xs font-medium text-text-tertiary"
            >
              Conta ativa para métricas
            </label>
            <div className="relative">
              <select
                id={`ad-account-select-${connection.id}`}
                value={connection.selectedAdAccountId ?? activeAdAccounts[0]?.id ?? ''}
                onChange={(e) => onSelectAccount(connection.id, e.target.value)}
                disabled={isSelectingAccount}
                className="w-full appearance-none rounded-xl border border-border bg-surface-secondary px-3 py-2 text-xs text-text-primary outline-none transition focus:border-brand disabled:opacity-50"
              >
                {activeAdAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-surface text-text-primary">
                    {acc.name} · {acc.id}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                {isSelectingAccount ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                ) : (
                  <svg className="h-3.5 w-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center gap-2 pt-2">
        {!tokenValid && (
          <button
            type="button"
            onClick={onReconnect}
            disabled={isReconnecting}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17708A] py-2 text-xs font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50 cursor-pointer`}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isReconnecting && 'animate-spin')} />
            {isReconnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDisconnect(connection.id)}
          disabled={isDeleting}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-full border border-error/40 px-4 py-2 text-xs font-semibold text-error dark:text-[#e8534f] transition-all hover:bg-error/10 hover:border-error cursor-pointer',
            isDeleting && 'opacity-50 cursor-not-allowed'
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
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
      <DialogContent className="max-w-md border-border bg-surface text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-text-primary">Desconectar conta Meta</DialogTitle>
          <DialogDescription className="text-xs text-text-tertiary">
            Tem certeza que deseja desconectar a conta Meta{' '}
            <span className="font-semibold text-text-primary">{accountId}</span>? Esta ação não
            pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <DialogClose asChild>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-border px-4 py-2 text-xs font-medium text-text-primary hover:bg-border cursor-pointer"
            >
              Cancelar
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-full bg-error px-4 py-2 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-50 cursor-pointer"
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

  const { data: scopes = [] } = useQuery<string[]>({
    queryKey: ['meta-scopes'],
    queryFn: async () => {
      try {
        const response = await api.get<{ success: boolean; data: { scopes: string[] } }>('/meta/scopes');
        return response.data.data.scopes ?? [];
      } catch {
        return [];
      }
    },
    enabled: connections.length > 0,
    placeholderData: [],
  });

  const REQUIRED_SCOPES = ['pages_show_list', 'ads_management', 'ads_read', 'instagram_content_publish'];
  const needsScopeReconnect =
    connections.length > 0 && REQUIRED_SCOPES.some((scope) => !scopes.includes(scope));

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
      void queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
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
      void queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      void queryClient.invalidateQueries({ queryKey: ['metrics-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['goals-progress-v2'] });
      void queryClient.invalidateQueries({ queryKey: ['metrics-daily-week'] });
      showToast('Conta ativa atualizada');
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
      {/* Notification Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-xs font-semibold text-white',
            toast.variant === 'error' ? 'bg-error' : 'bg-brand'
          )}
        >
          {toast.variant === 'error' ? '⚠️' : '✅'} {toast.message}
        </div>
      )}

      {/* Header Unificado do Projeto */}
      <PageHeader
        title="Integrações"
        description="Gerencie suas contas de anúncios conectadas"
        actions={
          <button
            type="button"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className={`inline-flex items-center gap-2 rounded-full bg-[#17708A] px-4 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50 cursor-pointer`}
          >
            <Plus className="h-3.5 w-3.5" />
            {connectMutation.isPending ? 'Carregando...' : 'Conectar conta'}
          </button>
        }
      />

      {/* Banner de alerta de scopes/permissões */}
      {needsScopeReconnect && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-brand/30 bg-brand/10 p-4">
          <p className="text-xs text-text-primary">
            Reconecte sua conta Meta para habilitar o acesso a posts do Instagram e a criação de campanhas de anúncios.
          </p>
          <button
            type="button"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className="shrink-0 rounded-full bg-[#17708A] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[#17708A]/90 disabled:opacity-50 cursor-pointer"
          >
            {connectMutation.isPending ? 'Reconectando...' : 'Reconectar'}
          </button>
        </div>
      )}

      <DisconnectDialog
        open={!!pendingDisconnect}
        accountId={pendingDisconnect?.accountId ?? ''}
        onCancel={() => setPendingDisconnect(null)}
        onConfirm={() => pendingDisconnect && disconnectMutation.mutate(pendingDisconnect.id)}
        isPending={disconnectMutation.isPending}
      />

      {/* Lista de Contas Conectadas */}
      {isLoading ? (
        <div className={`${SURFACE} flex items-center justify-center px-6 py-20`}>
          <LoadingSpinner />
        </div>
      ) : connections.length === 0 ? (
        <div className={`${SURFACE} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
          <p className="text-base font-medium text-text-primary">Nenhuma conta de anúncio conectada</p>
          <p className="max-w-sm text-sm text-text-tertiary">
            Integre sua conta Meta para gerenciar campanhas e acessar métricas diretamente no sistema.
          </p>
          <button
            type="button"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
            className={`mt-2 rounded-full bg-[#17708A] px-5 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50 cursor-pointer`}
          >
            Conectar conta Meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

      {/* Google Meu Negócio oculto (feature incompleta) — 2026-09 */}
      {/* <div className="space-y-4">
        <div className="pt-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Google Meu Negócio
        </div>
        <GoogleIntegrationCard />
      </div> */}
    </div>
  );
}