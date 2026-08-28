import { useState } from 'react';
import { Check, Star, Zap, Shield, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { usePlans, useSubscription, useSubscribe } from '@/hooks/useBilling';
import { useAuth } from '@/hooks/useAuth';
import type { Plan } from '@/types/billing';

const PLAN_DISPLAY: Record<string, {
  icon: React.ReactNode;
  highlight: boolean;
  badge?: string;
  accentColor: string;
  ringColor: string;
  features: string[];
}> = {
  starter: {
    icon: <Zap className="w-5 h-5" />,
    highlight: false,
    accentColor: '#1E88A8',
    ringColor: 'ring-[#1E88A8]/30',
    features: [
      'Até 5 campanhas ativas',
      'Dashboard de métricas básico',
      'Integração com Meta Ads',
      'Relatórios mensais',
      'Suporte por email',
    ],
  },
  pro: {
    icon: <Star className="w-5 h-5" />,
    highlight: true,
    badge: 'Mais popular',
    accentColor: '#1E88A8',
    ringColor: 'ring-[#1E88A8]/50',
    features: [
      'Campanhas ilimitadas',
      'Automação com regras de IA',
      'Estúdio criativo completo',
      'Relatórios em tempo real',
      'API de integrações',
      'Suporte prioritário via chat',
    ],
  },
  enterprise: {
    icon: <Shield className="w-5 h-5" />,
    highlight: false,
    accentColor: '#10B981',
    ringColor: 'ring-emerald-400/30',
    features: [
      'Tudo do plano Pro',
      'Multi-contas e times',
      'Integrações personalizadas',
      'SLA 99.9% garantido',
      'Gerente de conta dedicado',
      'Onboarding e treinamento',
    ],
  },
};

const BILLING_TYPE_LABELS: Record<string, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto Bancário',
  CREDIT_CARD: 'Cartão de Crédito',
};

function getPlanKey(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('enterprise')) return 'enterprise';
  if (lower.includes('pro')) return 'pro';
  return 'starter';
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

interface SubscribeDialogProps {
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  defaultEmail: string;
}

function SubscribeDialog({ plan, open, onOpenChange, defaultName, defaultEmail }: SubscribeDialogProps) {
  const navigate = useNavigate();
  const subscribe = useSubscribe();
  const [billingType, setBillingType] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    subscribe.mutate(
      { planId: plan.id, billingType, customerName: name, customerEmail: email, customerCpfCnpj: cpfCnpj },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          const link = (data as { paymentLink?: string }).paymentLink;
          if (link) {
            window.location.href = link;
          } else {
            navigate('/assinatura');
          }
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setError(msg ?? 'Erro ao processar assinatura. Tente novamente.');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#161814] border-white/10 text-text-primary">
        <DialogHeader>
          <DialogTitle>Assinar plano {plan.name}</DialogTitle>
          <DialogDescription className="text-text-secondary">
            {formatCurrency(plan.priceCents)}/mês — escolha a forma de pagamento
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Nome completo</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-[#1A1B17] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[#1E88A8]/50 focus:border-[#1E88A8]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border border-white/10 bg-[#1A1B17] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[#1E88A8]/50 focus:border-[#1E88A8]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-secondary">CPF / CNPJ</label>
            <input
              className="w-full rounded-xl border border-white/10 bg-[#1A1B17] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[#1E88A8]/50 focus:border-[#1E88A8]"
              placeholder="000.000.000-00"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              required
              minLength={11}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              {(['PIX', 'BOLETO', 'CREDIT_CARD'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBillingType(type)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
                    billingType === type
                      ? 'border-[#1E88A8] bg-[#1E88A8]/10 text-[#1E88A8]'
                      : 'border-white/10 bg-[#1A1B17] text-text-secondary hover:border-white/20 hover:text-text-primary'
                  }`}
                >
                  {BILLING_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={subscribe.isPending}
              className="bg-[#17708A] hover:bg-[#17708A]/80 text-white cursor-pointer"
            >
              {subscribe.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando…
                </span>
              ) : (
                'Confirmar assinatura'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PlanCardProps {
  plan: Plan;
  isCurrentPlan: boolean;
  onSubscribe: () => void;
}

function PlanCard({ plan, isCurrentPlan, onSubscribe }: PlanCardProps) {
  const key = getPlanKey(plan.name);
  const display = PLAN_DISPLAY[key] ?? PLAN_DISPLAY.starter;
  const features = (plan.features && plan.features.length > 0) ? plan.features : display.features;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-[#161814] p-6 sm:p-7 transition-all duration-200 hover:border-white/20 ${
        display.highlight
          ? `ring-2 ${display.ringColor} border-[#1E88A8]/50 shadow-[0_0_30px_-5px_rgba(30,136,168,0.15)]`
          : 'border-white/10'
      }`}
    >
      {display.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span
            className="inline-flex items-center gap-1 rounded-full px-3.5 py-1 text-xs font-bold text-white shadow-md bg-[#17708A]"
          >
            <Star className="w-3 h-3 fill-current" />
            {display.badge}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1E88A8]/10 text-[#1E88A8]"
        >
          {display.icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-text-primary">{plan.name}</h3>
          {isCurrentPlan && (
            <span className="inline-flex items-center rounded-full bg-[#1E88A8]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2A9BC0]">
              Seu plano atual
            </span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <span className="text-3xl font-extrabold text-text-primary">
          {formatCurrency(plan.priceCents)}
        </span>
        <span className="text-text-secondary text-sm">/mês</span>
      </div>

      <ul className="space-y-3 flex-1 mb-8">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-text-secondary">
            <Check
              className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#1E88A8]"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={display.highlight ? 'primary' : 'outline'}
        size="md"
        className={`w-full cursor-pointer ${
          display.highlight
            ? 'bg-[#17708A] hover:bg-[#17708A]/80 text-white border-transparent'
            : 'border-white/10 text-text-primary hover:bg-white/5'
        }`}
        disabled={isCurrentPlan}
        onClick={onSubscribe}
      >
        {isCurrentPlan ? 'Plano atual' : 'Assinar agora'}
      </Button>
    </div>
  );
}

export function Plans() {
  const { data: plans = [], isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const staticPlans: Plan[] = plans.length > 0 ? plans : [
    { id: '', name: 'Starter', priceCents: 29700, interval: 'monthly', features: null, isActive: true, createdAt: '' },
    { id: '', name: 'Pro', priceCents: 59700, interval: 'monthly', features: null, isActive: true, createdAt: '' },
    { id: '', name: 'Enterprise', priceCents: 149700, interval: 'monthly', features: null, isActive: true, createdAt: '' },
  ];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <PageHeader
          title="Planos ady"
          description="Escolha o plano ideal para escalar suas campanhas"
        />

        {plansLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[#1E88A8]" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center max-w-xl mx-auto">
              <h2 className="text-xl font-bold text-text-primary mb-2">
                Turbine seus resultados com o plano certo
              </h2>
              <p className="text-text-secondary text-sm">
                Todos os planos incluem 7 dias de trial gratuito. Cancele quando quiser.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {staticPlans.map((plan) => (
                <PlanCard
                  key={plan.id || plan.name}
                  plan={plan}
                  isCurrentPlan={subscription?.planId === plan.id && plan.id !== '' && subscription?.status !== 'cancelled'}
                  onSubscribe={() => setSelectedPlan(plan)}
                />
              ))}
            </div>

            <p className="text-center text-xs text-text-secondary pt-2">
              Pagamento processado com segurança via Asaas. Aceita PIX, Boleto e Cartão de Crédito.
            </p>
          </div>
        )}

        {selectedPlan && (
          <SubscribeDialog
            plan={selectedPlan}
            open={!!selectedPlan}
            onOpenChange={(open) => !open && setSelectedPlan(null)}
            defaultName={user?.name ?? ''}
            defaultEmail={user?.email ?? ''}
          />
        )}
      </div>
    </AppLayout>
  );
}