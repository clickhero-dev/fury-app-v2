import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CreditCard, Calendar, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSubscription, useCancelSubscription } from '@/hooks/useBilling';
import type { SubscriptionStatus } from '@/types/billing';

const STATUS_CONFIG: Record<SubscriptionStatus, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
}> = {
  active: {
    label: 'Ativo',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    bg: 'bg-success/10',
    text: 'text-success',
  },
  trial: {
    label: 'Trial',
    icon: <Clock className="w-3.5 h-3.5" />,
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  past_due: {
    label: 'Pagamento atrasado',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    bg: 'bg-error/10',
    text: 'text-error',
  },
  cancelled: {
    label: 'Cancelado',
    icon: <XCircle className="w-3.5 h-3.5" />,
    bg: 'bg-white/5',
    text: 'text-text-secondary',
  },
  inactive: {
    label: 'Inativo',
    icon: <XCircle className="w-3.5 h-3.5" />,
    bg: 'bg-white/5',
    text: 'text-text-secondary',
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 86_400_000) : 0;
}

export function Subscription() {
  const { data: subscription, isLoading } = useSubscription();
  const cancelSubscription = useCancelSubscription();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const handleCancel = () => {
    setCancelError('');
    cancelSubscription.mutate(undefined, {
      onSuccess: () => {
        setCancelDialogOpen(false);
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setCancelError(msg ?? 'Erro ao cancelar assinatura.');
      },
    });
  };

  if (isLoading) return null;

  if (!subscription || subscription.status === 'cancelled') {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-4xl mx-auto">
          <PageHeader title="Minha assinatura" description="Gerencie seu plano ady" />

          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#1E88A8]/10 flex items-center justify-center mx-auto mb-6">
              <CreditCard className="w-8 h-8 text-[#1E88A8]" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Sem assinatura ativa</h2>
            <p className="text-text-secondary mb-8">
              Você ainda não possui uma assinatura. Escolha um plano para começar.
            </p>
            <Link to="/planos">
              <Button variant="primary" size="md" className="bg-[#1E88A8] hover:bg-[#1E88A8]/80 text-white">
                Ver planos disponíveis
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[subscription.status] ?? STATUS_CONFIG.inactive;
  const canCancel = subscription.status === 'active' || subscription.status === 'trial';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader title="Minha assinatura" description="Gerencie seu plano ady" />

        {subscription.status === 'trial' && (
          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-warning">Você está no período de teste</p>
                {subscription.trialEndsAt && (() => {
                  const days = daysRemaining(subscription.trialEndsAt);
                  return (
                    <p className="text-sm text-warning/80 mt-1">
                      Seu trial encerra em <strong className="text-warning">{days === 0 ? 'hoje' : `${days} dia${days !== 1 ? 's' : ''}`}</strong> ({formatDate(subscription.trialEndsAt)})
                    </p>
                  );
                })()}
                <p className="text-xs text-warning/60 mt-1">
                  Após o período, você precisará escolher um plano para continuar usando a plataforma.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Card do Plano Atual */}
        <div className="rounded-2xl border border-white/10 bg-[#161814] p-6 sm:p-8">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {subscription.plan?.name ?? 'Básico'}
              </h2>
              {/* Preço oculto temporariamente
              <p className="text-text-secondary text-sm mt-1">
                {subscription.plan ? formatCurrency(subscription.plan.priceCents) + ' por mês' : 'R$ 50 por mês'}
              </p>
              */}
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-3.5 p-4 rounded-xl bg-[#1A1B17] border border-white/5 max-w-md">
              <Calendar className="w-5 h-5 text-[#1E88A8]" />
              <div>
                <p className="text-xs text-text-secondary">Próxima cobrança</p>
                <p className="text-sm font-semibold text-text-primary">
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
            </div>
          </div>

          {canCancel && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium border border-error/40 bg-transparent text-error hover:border-error hover:bg-error/10 transition-all duration-200 cursor-pointer"
              >
                Cancelar assinatura
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Cancelamento */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="bg-[#161814] border-white/10 text-text-primary">
          <DialogHeader>
            <DialogTitle>Cancelar assinatura</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso às funcionalidades
              do plano ao final do período atual.
            </DialogDescription>
          </DialogHeader>

          {cancelError && (
            <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {cancelError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setCancelDialogOpen(false)}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Manter assinatura
            </button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCancel}
              disabled={cancelSubscription.isPending}
              className="bg-error hover:bg-error/90 text-white cursor-pointer"
            >
              {cancelSubscription.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cancelando…
                </span>
              ) : (
                'Confirmar cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}