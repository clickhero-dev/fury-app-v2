import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CreditCard, Calendar, AlertTriangle, CheckCircle2, Clock, XCircle, Receipt, ExternalLink } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSubscription, useCancelSubscription, useInvoices } from '@/hooks/useBilling';
import type { SubscriptionStatus, InvoiceHistoryItem } from '@/types/billing';

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

const INVOICE_STATUS_CONFIG: Record<InvoiceHistoryItem['status'], { label: string; variant: BadgeVariant }> = {
  paid: { label: 'Pago', variant: 'success' },
  pending: { label: 'Pendente', variant: 'warning' },
  overdue: { label: 'Vencido', variant: 'error' },
  cancelled: { label: 'Cancelado', variant: 'default' },
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

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 ? Math.ceil(diff / 86_400_000) : 0;
}

export function Subscription() {
  const { data: subscription, isLoading } = useSubscription();
  const { data: invoices, isLoading: isInvoicesLoading } = useInvoices();
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

        <div className="rounded-2xl border border-border bg-surface">
          <div className="px-7 py-5 border-b border-border">
            <h3 className="font-bold text-text-primary">Histórico de Faturas</h3>
          </div>

          {isInvoicesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt className="w-6 h-6 text-[#EA580C]" />}
              title="Nenhuma fatura encontrada ainda"
              description="Suas faturas aparecerão aqui assim que forem geradas."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor (R$)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const invoiceStatus = INVOICE_STATUS_CONFIG[invoice.status];
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.paidAt ?? invoice.createdAt)}</TableCell>
                      <TableCell>{formatCurrency(invoice.amountCents)}</TableCell>
                      <TableCell>
                        <Badge variant={invoiceStatus.variant}>{invoiceStatus.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.invoiceUrl ? (
                          <a
                            href={invoice.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#EA580C] hover:underline"
                          >
                            Ver fatura
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-sm text-text-secondary">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
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
