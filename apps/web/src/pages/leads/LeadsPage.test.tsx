import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LeadsPage } from './LeadsPage';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet },
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const FORM_CAMPAIGN = { id: 'form_1', name: 'Camp Formulário', objective: 'OUTCOME_LEADS' };
const TRAFFIC_CAMPAIGN = { id: 'traffic_1', name: 'Camp Tráfego', objective: 'OUTCOME_TRAFFIC' };

function mockApi(leads: unknown[] = [], campaigns: unknown[] = [FORM_CAMPAIGN, TRAFFIC_CAMPAIGN]) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/campaigns') {
      return Promise.resolve({ data: { success: true, data: campaigns } });
    }
    if (url === '/campaigns/leads') {
      return Promise.resolve({ data: { success: true, data: leads } });
    }
    if (url.startsWith('/campaigns/') && url.endsWith('/leads')) {
      return Promise.resolve({ data: { success: true, data: leads } });
    }
    return Promise.resolve({ data: { success: true, data: [] } });
  });
}

describe('LeadsPage', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('carrega leads agregados por padrão (Todas as campanhas) e exibe a coluna Campanha', async () => {
    mockApi([
      {
        name: 'Maria Souza', email: 'maria@exemplo.com', phone: '11999999999',
        createdAt: '2026-09-21T12:00:00Z', campaignId: 'form_1', campaignName: 'Camp Formulário',
      },
    ]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('maria@exemplo.com')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    // Coluna Campanha visível na visão "todas"
    expect(screen.getByText('Campanha')).toBeInTheDocument();
    // "Camp Formulário" aparece na coluna da tabela (e no option do filtro)
    expect(screen.getAllByText('Camp Formulário').length).toBeGreaterThanOrEqual(2);
    // Chamou o agregado /campaigns/leads
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/campaigns/leads'));
  });

  it('filtro lista apenas campanhas de Formulário (não campanhas de tráfego)', async () => {
    mockApi([]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/campaigns', expect.any(Object)));
    const select = await screen.findByRole('combobox', { name: /Filtrar por campanha/i });
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('Todas as campanhas');
    expect(options).toContain('Camp Formulário');
    expect(options).not.toContain('Camp Tráfego');
  });

  it('selecionar uma campanha busca leads da campanha específica', async () => {
    mockApi([
      {
        name: 'João Silva', email: 'joao@exemplo.com', phone: '21988887777',
        createdAt: '2026-09-20T10:00:00Z',
      },
    ]);
    const user = userEvent.setup();

    render(<LeadsPage />, { wrapper: makeWrapper() });

    const select = await screen.findByRole('combobox', { name: /Filtrar por campanha/i });
    // Aguarda as opções carregarem antes de selecionar
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Camp Formulário' })).toBeInTheDocument();
    });
    await user.selectOptions(select, 'form_1');

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/campaigns/form_1/leads'));
    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    // Coluna Campanha some quando há campanha específica selecionada
    expect(screen.queryByText('Campanha')).not.toBeInTheDocument();
  });

  it('exibe estado vazio quando nenhuma campanha de Formulário existe', async () => {
    mockApi([], [TRAFFIC_CAMPAIGN]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhuma campanha de Formulário')).toBeInTheDocument();
  });

  it('exibe estado vazio quando não há leads', async () => {
    mockApi([]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Nenhum lead ainda')).toBeInTheDocument();
  });
});