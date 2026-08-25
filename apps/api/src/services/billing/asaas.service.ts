import { AppError } from '../../middleware/errorHandler.js';

const BASE_URL =
  process.env.ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

function getHeaders() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error('ASAAS_API_KEY não configurada');
  return {
    'Content-Type': 'application/json',
    access_token: key,
  };
}

async function asaasRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();

  if (!res.ok) {
    let message = `Asaas API error ${res.status}`;
    try {
      const json = JSON.parse(text) as { errors?: { description: string }[] };
      if (json.errors?.length) message = json.errors.map((e) => e.description).join('; ');
    } catch {}
    throw new AppError(502, 'ASAAS_ERROR', message);
  }

  return JSON.parse(text) as T;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type AsaasCustomer = {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
};

export type AsaasSubscription = {
  id: string;
  customer: string;
  billingType: string;
  cycle: string;
  value: number;
  nextDueDate: string;
  status: string;
};

export type AsaasPayment = {
  id: string;
  customer: string;
  value: number;
  netValue: number;
  status: string;
  dueDate: string;
  paymentDate?: string;
  billingType: string;
  invoiceUrl?: string;
};

// ──────────────────────────────────────────────
// Customer
// ──────────────────────────────────────────────

export async function createCustomer(data: {
  name: string;
  email: string;
  cpfCnpj?: string;
  externalReference?: string;
}): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>('POST', '/customers', data);
}

export async function findCustomerByExternalReference(ref: string): Promise<AsaasCustomer | null> {
  const res = await asaasRequest<{ data: AsaasCustomer[] }>(
    'GET',
    `/customers?externalReference=${encodeURIComponent(ref)}`
  );
  return res.data?.[0] ?? null;
}

export async function updateCustomer(
  id: string,
  data: Partial<{ name: string; email: string; cpfCnpj: string }>
): Promise<AsaasCustomer> {
  return asaasRequest<AsaasCustomer>('PUT', `/customers/${id}`, data);
}

// ──────────────────────────────────────────────
// Subscription
// ──────────────────────────────────────────────

export type CreateSubscriptionInput = {
  customer: string;
  billingType: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
  cycle: 'MONTHLY' | 'YEARLY';
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
};

export async function createSubscription(data: CreateSubscriptionInput): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>('POST', '/subscriptions', data);
}

export async function cancelSubscription(asaasSubscriptionId: string): Promise<void> {
  await asaasRequest('DELETE', `/subscriptions/${asaasSubscriptionId}`);
}

export async function getSubscription(asaasSubscriptionId: string): Promise<AsaasSubscription> {
  return asaasRequest<AsaasSubscription>('GET', `/subscriptions/${asaasSubscriptionId}`);
}

// ──────────────────────────────────────────────
// Payment
// ──────────────────────────────────────────────

export async function getPayment(asaasPaymentId: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>('GET', `/payments/${asaasPaymentId}`);
}
