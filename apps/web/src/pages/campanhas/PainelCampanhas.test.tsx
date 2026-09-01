import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PainelCampanhas } from './PainelCampanhas';

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
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/campanhas']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PainelCampanhas — Total Clientes vs /metrics/summary', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('exibe no "Total Clientes" o valor de conversões do /metrics/summary (mesma fonte do dashboard)', async () => {
    // Dashboard (summary) soma ACTIVE + PAUSED = 1234.
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/metrics/summary') {
        return Promise.resolve({
          data: { success: true, data: { summary: { spend: 5000, conversions: 1234, roas: 2, cpa: 15 } } },
        });
      }
      if (url === '/metrics/campaigns') {
        // Campanhas filtradas como "ativo" teriam soma menor (apenas 80).
        return Promise.resolve({
          data: {
            success: true,
            data: [
              { id: 'a', name: 'Camp Ativa', status: 'ACTIVE', conversions: 80, spend: 100 },
              { id: 'b', name: 'Camp Pausada', status: 'PAUSED', conversions: 1154, spend: 4900 },
            ],
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<PainelCampanhas />, { wrapper: makeWrapper() });

    // O valor deve vir do /metrics/summary (1.234), e NÃO da soma das linhas
    // filtradas como "ativo" (que seria apenas "80").
    expect(await screen.findByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('Total Clientes')).toBeInTheDocument();
  });

  it('não exibe totais quando não há campanhas nem summary', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/metrics/summary') return Promise.resolve({ data: { success: true, data: { summary: null } } });
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<PainelCampanhas />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma campanha por aqui ainda')).toBeInTheDocument();
    expect(screen.queryByText('Total Clientes')).not.toBeInTheDocument();
  });
});