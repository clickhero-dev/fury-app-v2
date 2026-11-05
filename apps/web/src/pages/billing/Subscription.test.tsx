import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { Subscription } from './Subscription';
import { store } from '@/store';
import type { InvoiceHistoryItem, Subscription as SubscriptionType } from '@/types/billing';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const SUBSCRIPTION: SubscriptionType = {
  id: 'sub-1',
  tenantId: 'tenant-1',
  planId: 'plan-1',
  status: 'active',
  isNonExpirable: false,
  trialEndsAt: null,
  currentPeriodEnd: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  plan: {
    id: 'plan-1',
    name: 'Profissional',
    priceCents: 9900,
    interval: 'monthly',
    features: [],
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  invoices: [],
};

const INVOICES: InvoiceHistoryItem[] = [
  {
    id: 'inv-1',
    subscriptionId: 'sub-1',
    status: 'paid',
    amountCents: 9900,
    currency: 'BRL',
    invoiceUrl: 'https://exemplo.com/fatura/1',
    paidAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

function mockApi({
  subscription = SUBSCRIPTION,
  invoices = INVOICES,
}: { subscription?: SubscriptionType | null; invoices?: InvoiceHistoryItem[] } = {}) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/billing/subscription') {
      return Promise.resolve({ data: { success: true, data: subscription } });
    }
    if (url === '/billing/invoices') {
      return Promise.resolve({ data: { success: true, data: invoices } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/assinatura']}>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('Subscription — /assinatura', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('não exibe o card de histórico de assinatura/faturas, mesmo havendo faturas na API', async () => {
    mockApi();

    render(<Subscription />, { wrapper: makeWrapper() });

    // O card do plano continua sendo exibido
    expect(await screen.findByText('Profissional')).toBeInTheDocument();

    // Nenhuma referência ao histórico de assinatura/faturas
    expect(screen.queryByText('Histórico de faturas')).not.toBeInTheDocument();
    expect(screen.queryByText('Histórico de assinatura')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma fatura ainda')).not.toBeInTheDocument();
    expect(screen.queryByText('Ver fatura')).not.toBeInTheDocument();
  });

  it('não exibe o card de histórico mesmo quando a lista de faturas está vazia', async () => {
    mockApi({ invoices: [] });

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Profissional')).toBeInTheDocument();
    expect(screen.queryByText('Histórico de faturas')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma fatura ainda')).not.toBeInTheDocument();
  });
});