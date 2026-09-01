import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Subscription } from './Subscription';
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

const INVOICE: InvoiceHistoryItem = {
  id: 'inv-1',
  amountCents: 9900,
  status: 'paid',
  paidAt: '2026-08-15T00:00:00.000Z',
  asaasPaymentId: 'pay-1',
  createdAt: '2026-08-15T00:00:00.000Z',
  invoiceUrl: 'https://asaas.example.com/invoice/1',
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/assinatura']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Subscription — histórico de faturas condicionado aos dados', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('oculta o título e a tabela de "Histórico de faturas" quando a lista está vazia, mostrando o estado vazio', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: SUBSCRIPTION } }) // /billing/subscription
      .mockResolvedValueOnce({ data: { success: true, data: [] } }); // /billing/invoices

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma fatura gerada ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Histórico de faturas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('exibe estado de loading dedicado enquanto a lista de faturas carrega', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: SUBSCRIPTION } }) // /billing/subscription
      .mockReturnValueOnce(new Promise(() => {})); // /billing/invoices nunca resolve

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByLabelText(/carregando faturas/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Histórico de faturas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('exibe estado de erro dedicado quando a lista de faturas falha, com botão de tentar novamente', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: SUBSCRIPTION } }) // /billing/subscription
      .mockRejectedValueOnce(new Error('API indisponível')); // /billing/invoices

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByText(/não foi possível carregar as faturas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Histórico de faturas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renderiza título e tabela de faturas quando há faturas no período atual', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: SUBSCRIPTION } }) // /billing/subscription
      .mockResolvedValueOnce({ data: { success: true, data: [INVOICE] } }); // /billing/invoices

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByRole('heading', { name: /Histórico de faturas/i })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Pago')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver fatura/i })).toBeInTheDocument();
  });

  it('só renderiza o link "Ver fatura" quando a fatura possui URL válida', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: SUBSCRIPTION } }) // /billing/subscription
      .mockResolvedValueOnce({ data: { success: true, data: [{ ...INVOICE, invoiceUrl: null }] } }); // /billing/invoices

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByRole('heading', { name: /Histórico de faturas/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver fatura/i })).not.toBeInTheDocument();
  });

  it('não renderiza a seção de faturas quando o tenant não tem assinatura ativa', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { success: true, data: null } }) // /billing/subscription
      .mockResolvedValueOnce({ data: { success: true, data: [] } }); // /billing/invoices

    render(<Subscription />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Sem assinatura ativa')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Histórico de faturas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});