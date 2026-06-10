export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: 'monthly' | 'yearly';
  features: string[] | null;
  isActive: boolean;
  createdAt: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceHistoryItem {
  id: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paidAt: string | null;
  asaasPaymentId: string | null;
  createdAt: string;
  invoiceUrl: string | null;
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'inactive';

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

export interface SubscribePayload {
  planId: string;
  billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
  customerName: string;
  customerEmail: string;
  customerCpfCnpj?: string;
}

export interface BillingApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}
