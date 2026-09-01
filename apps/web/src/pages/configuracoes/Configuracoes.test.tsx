import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { Configuracoes } from './Configuracoes';
import { store } from '@/store';
import type { Subscription as SubscriptionType } from '@/types/billing';

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

const ME = {
  id: 'user-1',
  name: 'Diogo',
  email: 'diogo@fury.app',
  tenantName: 'Fury Ltda',
  tenantSlug: 'fury',
  tenantCodigo: '123',
  role: 'admin',
  tenantId: 'tenant-1',
};

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

function mockApi(overrides: { subscription?: SubscriptionType | null; me?: boolean } = {}) {
  const { subscription = SUBSCRIPTION, me = true } = overrides;
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/auth/me') {
      return me
        ? Promise.resolve({ data: { success: true, data: ME } })
        : Promise.reject(new Error('API indisponível'));
    }
    if (url === '/billing/subscription') {
      return Promise.resolve({ data: { success: true, data: subscription } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/configuracoes?tab=faturamento']}>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('Configuracoes — aba Faturamento', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('exibe "Vencimento do Plano" no lugar de "Próxima Cobrança" quando há assinatura ativa', async () => {
    mockApi();

    render(<Configuracoes />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Vencimento do Plano')).toBeInTheDocument();
    expect(screen.queryByText('Próxima Cobrança')).not.toBeInTheDocument();
  });

  it('remove o preço (Valor Mensal) do resumo do plano ativo', async () => {
    mockApi();

    render(<Configuracoes />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Vencimento do Plano')).toBeInTheDocument();
    expect(screen.queryByText('Valor Mensal')).not.toBeInTheDocument();
    expect(screen.queryByText('R$ 99,00')).not.toBeInTheDocument();
  });

  it('mantém o comportamento da assinatura em trial sem preço nem "Próxima Cobrança"', async () => {
    mockApi({
      subscription: {
        ...SUBSCRIPTION,
        status: 'trial',
        trialEndsAt: '2026-09-15T00:00:00.000Z',
        plan: null,
      },
    });

    render(<Configuracoes />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Trial expira em')).toBeInTheDocument();
    expect(screen.queryByText('Próxima Cobrança')).not.toBeInTheDocument();
    expect(screen.queryByText('Valor Mensal')).not.toBeInTheDocument();
  });

  it('mantém o estado vazio quando não há assinatura ativa', async () => {
    mockApi({ subscription: null });

    render(<Configuracoes />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma assinatura ativa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver planos/i })).toBeInTheDocument();
    expect(screen.queryByText('Próxima Cobrança')).not.toBeInTheDocument();
    expect(screen.queryByText('Valor Mensal')).not.toBeInTheDocument();
  });
});