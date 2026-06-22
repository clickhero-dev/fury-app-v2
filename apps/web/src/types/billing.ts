/** Plano de assinatura disponível na plataforma. */
export interface Plan {
  id: string;
  name: string;
  /** Preço em centavos (ex: 9900 = R$ 99,00). */
  priceCents: number;
  interval: 'monthly' | 'yearly';
  features: string[] | null;
  isActive: boolean;
  createdAt: string;
}

/** Fatura de uma assinatura. */
export interface Invoice {
  id: string;
  subscriptionId: string;
  /** Valor em centavos. */
  amountCents: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  createdAt: string;
}

/** Item do histórico de faturas exibido na página de assinatura. */
export interface InvoiceHistoryItem {
  id: string;
  /** Valor em centavos. */
  amountCents: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  /** ID do pagamento no Asaas para rastreamento. */
  asaasPaymentId: string | null;
  createdAt: string;
  /** URL para visualizar/baixar a fatura. */
  invoiceUrl: string | null;
}

/** Status possíveis de uma assinatura. */
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'inactive';

/** Assinatura ativa do tenant. */
export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  plan: Plan | null;
  invoices: Invoice[];
}

/** Payload para criação de uma nova assinatura via Asaas. */
export interface SubscribePayload {
  planId: string;
  billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
  customerName: string;
  customerEmail: string;
  customerCpfCnpj?: string;
}

/** Envelope padrão das respostas da API de billing. */
export interface BillingApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}