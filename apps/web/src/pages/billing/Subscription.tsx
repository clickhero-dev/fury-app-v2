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
import type { SubscriptionStatus, Invoice } from '@/types/billing';

const STATUS_CONFIG: Record<SubscriptionStatus, {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
}> = {
  active: {
    label: 'Ativo',
    icon: <CheckCircle2 className="w-4 h-4" />,
    bg: 'bg-success/10',
    text: 'text-success',
  },
  trial: {
    label: 'Trial',
    icon: <Clock className="w-4 h-4" />,
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  past_due: {
    label: 'Pagamento atrasado',
    icon: <AlertTriangle className="w-4 h-4" />,
    bg: 'bg-error/10',
    text: 'text-error',
  },
  cancelled: {
    label: 'Cancelado',
    icon: <XCircle className="w-4 h-4" />,
    bg: 'bg-border',
    text: 'text-text-secondary',
  },
  inactive: {
    label: 'Inativo',
    icon: <XCircle className="w-4 h-4" />,
    bg: 'bg-border',
    text: 'text-text-secondary',
  },
};

const INVOICE_STATUS_CONFIG: Record<Invoice['status'], { label: string; color: string }> = {
  paid: { label: 'Pago', color: 'text-success bg-success/10' },
  pending: { label: 'Pendente', color: 'text-warning bg-warning/10' },
  overdue: { label: 'Atrasado', color: 'text-error bg-error/10' },
  cancelled: { label: 'Cancelado', color: 'text-text-secondary bg-border' },
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
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

  if (isLoading) {
    return (
      <AppLayout
        header={
          <div className="px-6 py-4">
            <PageHeader title="Minha Assinatura" description="Gerencie sua assinatura FURY" />
          </div>
        }
      >
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-[#EA580C]" />
        </div>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout
        header={
          <div className="px-6 py-4">
            <PageHeader title="Minha Assinatura" description="Gerencie sua assinatura FURY" />
          </div>
        }
      >
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-[#EA580C]/10 flex items-center justify-center mx-auto mb-6">
            <CreditCard className="w-8 h-8 text-[#EA580C]" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Sem assinatura ativa</h2>
          <p className="text-text-secondary mb-8">
            Você ainda não possui uma assinatura. Escolha um plano para começar.
          </p>
          <Link to="/planos">
            <Button variant="primary" size="md">Ver planos disponíveis</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[subscription.status] ?? STATUS_CONFIG.inactive;
  const canCancel = subscription.status === 'active' || subscription.status === 'trial';

  return (
    <AppLayout
      header={
        <div className="px-6 py-4">
          <PageHeader title="Minha Assinatura" description="Gerencie sua assinatura FURY" />
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-2xl border border-border bg-surface p-7">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {subscription.plan?.name ?? 'Plano'}
              </h2>
              <p className="text-text-secondary text-sm mt-0.5">
                {subscription.plan ? formatCurrency(subscription.plan.priceCents) + '/mês' : '—'}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-secondary">
              <Calendar className="w-5 h-5 text-[#EA580C]" />
              <div>
                <p className="text-xs text-text-secondary">Próxima cobrança</p>
                <p className="text-sm font-semibold text-text-primary">
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
            </div>

            {subscription.status === 'trial' && subscription.trialEndsAt && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10">
                <Clock className="w-5 h-5 text-warning" />
                <div>
                  <p className="text-xs text-warning/80">Trial encerra em</p>
                  <p className="text-sm font-semibold text-warning">
                    {formatDate(subscription.trialEndsAt)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {canCancel && (
            <div className="border-t border-border pt-5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(true)}
                className="border-error/40 text-error hover:bg-error/10"
              >
                Cancelar assinatura
              </Button>
            </div>
          )}
        </div>

        {subscription.invoices && subscription.invoices.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface">
            <div className="px-7 py-5 border-b border-border">
              <h3 className="font-bold text-text-primary">Histórico de faturas</h3>
            </div>
            <div className="divide-y divide-border">
              {subscription.invoices.map((invoice) => {
                const invoiceStatus = INVOICE_STATUS_CONFIG[invoice.status];
                return (
                  <div key={invoice.id} className="flex items-center justify-between px-7 py-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {formatCurrency(invoice.amountCents)}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {invoice.paidAt
                          ? `Pago em ${formatDate(invoice.paidAt)}`
                          : `Emitido em ${formatDate(invoice.createdAt)}`}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${invoiceStatus.color}`}
                    >
                      {invoiceStatus.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar assinatura</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar sua assinatura? Você perderá acesso às funcionalidades
              do plano ao final do período atual.
            </DialogDescription>
          </DialogHeader>

          {cancelError && (
            <p className="text-sm text-error bg-error/10 rounded-lg px-3 py-2">{cancelError}</p>
          )}

          <DialogFooter>
            <button
              onClick={() => setCancelDialogOpen(false)}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Manter assinatura
            </button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCancel}
              disabled={cancelSubscription.isPending}
              className="bg-error hover:bg-error/90 text-white"
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
