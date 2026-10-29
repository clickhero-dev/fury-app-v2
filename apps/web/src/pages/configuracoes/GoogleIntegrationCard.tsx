import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, RefreshCw, LogOut, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGoogleConnection,
  useGoogleConnect,
  useGoogleDisconnect,
  useGoogleLookup,
} from './google-meu-negocio/useGoogleMeuNegocio';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';

const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 shadow-sm hover:border-border-light transition-all duration-300';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

export function GoogleIntegrationCard() {
  const navigate = useNavigate();
  const { data: connection, isLoading } = useGoogleConnection();
  const { data: lookup, isLoading: lookupLoading } = useGoogleLookup(!!connection);
  const connectMutation = useGoogleConnect();
  const disconnectMutation = useGoogleDisconnect();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const connected = !!connection;
  const tokenValid = connected && new Date(connection.tokenExpiresAt) > new Date();
  const profileExists = lookup?.found === true || (lookup?.matches?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className={`${SURFACE_CARD} flex items-center justify-center px-6 py-12`}>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    );
  }

  return (
    <div className={`${SURFACE_CARD} flex flex-col justify-between space-y-6`}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Google Meu Negócio</h3>
              <p className="mt-0.5 text-xs text-text-tertiary">
                Perfil da sua empresa no Google
              </p>
            </div>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
              connected && tokenValid
                ? 'bg-brand/10 text-brand'
                : 'bg-text-tertiary/10 text-text-tertiary'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                connected && tokenValid ? 'bg-brand' : 'bg-text-tertiary'
              )}
            />
            {connected && tokenValid ? 'Conectado' : 'Não conectado'}
          </span>
        </div>

        {connected && tokenValid && (
          <p className="text-xs text-text-tertiary">
            Conta: <span className="font-medium text-text-primary">{connection.accountName ?? connection.googleUserId}</span>
          </p>
        )}

        {connected && !tokenValid && (
          <p className="text-xs text-warning">
            Sua conexão com o Google expirou. Reconecte para continuar gerenciando seu perfil.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2">
        {connected && !tokenValid && (
          <button
            type="button"
            onClick={() => connectMutation.mutate('settings')}
            disabled={connectMutation.isPending}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17708A] py-2 text-xs font-semibold text-white cursor-pointer',
              BUTTON_HOVER,
              connectMutation.isPending && 'opacity-50'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', connectMutation.isPending && 'animate-spin')} />
            {connectMutation.isPending ? 'Reconectando...' : 'Reconectar'}
          </button>
        )}

        {connected ? (
          <>
            {profileExists ? (
              <a
                href="/configuracoes/google-meu-negocio"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/configuracoes/google-meu-negocio');
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17708A] py-2 text-xs font-semibold text-white cursor-pointer',
                  BUTTON_HOVER
                )}
              >
                Ver como está meu Google Meu Negócio
                <ChevronRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/configuracoes/google-meu-negocio')}
                disabled={lookupLoading}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17708A] py-2 text-xs font-semibold text-white cursor-pointer',
                  BUTTON_HOVER,
                  lookupLoading && 'opacity-50'
                )}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {lookupLoading ? 'Verificando...' : 'Configurar agora'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={disconnectMutation.isPending}
              className={cn(
                'flex items-center justify-center gap-2 rounded-full border border-error/40 px-4 py-2 text-xs font-semibold text-error transition-all hover:bg-error/10 hover:border-error cursor-pointer',
                disconnectMutation.isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => connectMutation.mutate('settings')}
            disabled={connectMutation.isPending}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-full bg-[#17708A] py-2 text-xs font-semibold text-white cursor-pointer',
              BUTTON_HOVER,
              connectMutation.isPending && 'opacity-50'
            )}
          >
            {connectMutation.isPending ? 'Carregando...' : 'Conectar Google'}
          </button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={(v) => { if (!v) setConfirmOpen(false); }}>
        <DialogContent className="max-w-md border-border bg-surface text-text-primary">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-text-primary">Desconectar conta Google</DialogTitle>
            <DialogDescription className="text-xs text-text-tertiary">
              Tem certeza que deseja desconectar o Google Meu Negócio? O perfil criado no Google não
              será removido, apenas a conexão com a Ady.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <DialogClose asChild>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-xs font-medium text-text-primary hover:bg-border cursor-pointer"
              >
                Cancelar
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => {
                disconnectMutation.mutate(connection!.id, {
                  onSuccess: () => setConfirmOpen(false),
                });
              }}
              disabled={disconnectMutation.isPending}
              className="rounded-full bg-error px-4 py-2 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-50 cursor-pointer"
            >
              {disconnectMutation.isPending ? 'Desconectando...' : 'Desconectar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}