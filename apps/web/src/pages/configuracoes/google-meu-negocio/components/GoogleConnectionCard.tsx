import { useState } from 'react';
import { Building2, LogOut, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components';
import { DialogClose } from '@/components/ui/dialog';
import type { GoogleConnection } from '@/types/google';

const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 shadow-sm hover:border-border-light transition-all duration-300';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

function isTokenValid(tokenExpiresAt: string): boolean {
  return new Date(tokenExpiresAt) > new Date();
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ConnectCta({
  onConnect,
  isConnecting,
  title,
  description,
}: {
  onConnect: () => void;
  isConnecting: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className={`${SURFACE_CARD} flex flex-col items-center gap-4 text-center`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Building2 className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="max-w-sm text-sm text-text-tertiary">{description}</p>
      </div>
      <button
        type="button"
        onClick={onConnect}
        disabled={isConnecting}
        className={cn(
          'mt-1 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white cursor-pointer',
          BUTTON_HOVER,
          isConnecting && 'opacity-50'
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {isConnecting ? 'Carregando...' : 'Conectar Google'}
      </button>
    </div>
  );
}

function DisconnectDialog({
  open,
  accountName,
  onCancel,
  onConfirm,
  isPending,
}: {
  open: boolean;
  accountName: string;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md border-border bg-surface text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-text-primary">Desconectar conta Google</DialogTitle>
          <DialogDescription className="text-xs text-text-tertiary">
            Tem certeza que deseja desconectar o Google Meu Negócio{' '}
            <span className="font-semibold text-text-primary">{accountName}</span>? O perfil criado no
            Google não será removido, apenas a conexão com a Ady.
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

function ConnectedCard({
  connection,
  onConnect,
  isConnecting,
  onDisconnect,
  isDisconnecting,
}: {
  connection: GoogleConnection;
  onConnect: () => void;
  isConnecting: boolean;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tokenValid = isTokenValid(connection.tokenExpiresAt);

  return (
    <div className={`${SURFACE_CARD} flex flex-col justify-between space-y-6`}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Google Meu Negócio{connection.accountName ? ` · ${connection.accountName}` : ''}
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              Conectado em {formatDate(connection.tokenExpiresAt)}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              tokenValid ? 'bg-brand/10 text-brand' : 'bg-warning/10 text-warning'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                tokenValid ? 'bg-brand' : 'bg-warning'
              )}
            />
            {tokenValid ? 'Ativa' : 'Token expirado'}
          </span>
        </div>

        {tokenValid ? (
          <p className="text-xs text-text-tertiary">
            Conta Google vinculada: <span className="font-medium text-text-primary">{connection.googleUserId}</span>
          </p>
        ) : (
          <p className="text-xs text-warning">
            Sua conexão com o Google expirou. Reconecte para continuar gerenciando seu perfil.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2">
        {!tokenValid && (
          <button
            type="button"
            onClick={onConnect}
            disabled={isConnecting}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full bg-brand py-2 text-xs font-semibold text-white cursor-pointer',
              BUTTON_HOVER,
              isConnecting && 'opacity-50'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isConnecting && 'animate-spin')} />
            {isConnecting ? 'Reconectando...' : 'Reconectar'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isDisconnecting}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-full border border-error/40 px-4 py-2 text-xs font-semibold text-error transition-all hover:bg-error/10 hover:border-error cursor-pointer',
            isDisconnecting && 'opacity-50 cursor-not-allowed'
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          {isDisconnecting ? 'Desconectando...' : 'Desconectar'}
        </button>
      </div>

      <DisconnectDialog
        open={confirmOpen}
        accountName={connection.accountName ?? connection.googleUserId}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          onDisconnect();
          setConfirmOpen(false);
        }}
        isPending={isDisconnecting}
      />
    </div>
  );
}

export function GoogleConnectionCard({
  connection,
  isLoading,
  onConnect,
  isConnecting,
  onDisconnect,
  isDisconnecting,
}: {
  connection: GoogleConnection | null;
  isLoading: boolean;
  onConnect: () => void;
  isConnecting: boolean;
  onDisconnect: (id: string) => void;
  isDisconnecting: boolean;
}) {
  if (isLoading) {
    return (
      <div className={`${SURFACE_CARD} flex items-center justify-center px-6 py-12`}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    );
  }

  if (!connection) {
    return (
      <ConnectCta
        onConnect={onConnect}
        isConnecting={isConnecting}
        title="Conecte sua conta Google"
        description="Conecte seu Google Meu Negócio para verificar se já existe um perfil do seu negócio e gerenciá-lo direto pela Ady."
      />
    );
  }

  return (
    <ConnectedCard
      connection={connection}
      onConnect={onConnect}
      isConnecting={isConnecting}
      onDisconnect={() => onDisconnect(connection.id)}
      isDisconnecting={isDisconnecting}
    />
  );
}