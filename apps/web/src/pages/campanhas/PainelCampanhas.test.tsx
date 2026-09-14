import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PainelCampanhas } from './PainelCampanhas';
import { CampaignWizardProvider } from '@/contexts/CampaignWizardContext';

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

vi.mock('@/components/campaign-wizard/CampaignWizard', () => ({
  CampaignWizard: () => null,
}));
vi.mock('@/hooks/usePauseCampaign', () => ({ usePauseCampaign: () => ({ isPending: false, mutate: vi.fn() }) }));
vi.mock('@/hooks/useDeleteCampaign', () => ({ useDeleteCampaign: () => ({ isPending: false, mutate: vi.fn() }) }));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <CampaignWizardProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/campanhas']}>{children}</MemoryRouter>
      </QueryClientProvider>
    </CampaignWizardProvider>
  );
}

function mockCampaigns(rows: Record<string, unknown>[]) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/metrics/campaigns') {
      return Promise.resolve({ data: { success: true, data: rows } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

describe('PainelCampanhas — Total Clientes = soma das linhas de campanha', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('o "Total Clientes" é a soma das conversões das linhas exibidas (ativas + pausadas, padrão)', async () => {
    mockCampaigns([
      { id: 'a', name: 'Camp Ativa', status: 'ACTIVE', conversions: 80, spend: 100 },
      { id: 'b', name: 'Camp Pausada', status: 'PAUSED', conversions: 1154, spend: 4900 },
      { id: 'c', name: 'Camp Finalizada', status: 'ARCHIVED', conversions: 5000, spend: 9000 },
    ]);

    render(<PainelCampanhas />, { wrapper: makeWrapper() });

    // Total = 80 + 1154 = 1.234 (finalizada fica fora do padrão).
    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('Total Clientes')).toBeInTheDocument();
    expect(screen.queryByText('6.234')).not.toBeInTheDocument();
    // Total investido = 100 + 4900 = 5.000 (finalizada fica fora).
    expect(screen.getByText('R$ 5.000,00')).toBeInTheDocument();
  });

  it('não exibe totais quando não há campanhas', async () => {
    mockApiGet.mockImplementation(() =>
      Promise.resolve({ data: { success: true, data: [] } })
    );

    render(<PainelCampanhas />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma campanha por aqui ainda')).toBeInTheDocument();
    expect(screen.queryByText('Total Clientes')).not.toBeInTheDocument();
  });
});
