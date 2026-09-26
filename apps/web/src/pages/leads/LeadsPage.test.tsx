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
    if (url === '/v2/lead-campaigns') {
      // Contrato do backend: JÁ retorna só OUTCOME_LEADS (filtro é server-side)
      const leadCampaigns = (campaigns as Array<{ objective?: string }>).filter((c) => c.objective === 'OUTCOME_LEADS');
      return Promise.resolve({ data: { success: true, data: leadCampaigns } });
    }
    if (url === '/v2/leads') {
      return Promise.resolve({ data: { success: true, data: leads } });
    }
    if (url.startsWith('/v2/campaigns/') && url.endsWith('/leads')) {
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
    // Chamou o agregado /v2/leads
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/v2/leads'));
  });

  it('filtro usa a fonte Meta (/v2/lead-campaigns) e lista as campanhas retornadas', async () => {
    mockApi([]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/v2/lead-campaigns'));
    const select = await screen.findByRole('combobox', { name: /Filtrar por campanha/i });
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toContain('Todas as campanhas');
    expect(options).toContain('Camp Formulário');
    // O filtro de Formulário é server-side: o backend já retorna só OUTCOME_LEADS.
    expect(options).not.toContain('Camp Tráfego');
    // O filtro não consulta mais a listagem genérica de campanhas
    expect(mockApiGet).not.toHaveBeenCalledWith('/campaigns', expect.any(Object));
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

    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/v2/campaigns/form_1/leads'));
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

    expect(await screen.findByText('Nenhum cliente ainda')).toBeInTheDocument();
  });

  it('exibe a mensagem de erro da API quando a busca de leads falha (ex.: 401 token Meta expirado)', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/v2/lead-campaigns') {
        return Promise.resolve({ data: { success: true, data: [FORM_CAMPAIGN] } });
      }
      if (url === '/v2/leads') {
        return Promise.reject({
          response: {
            data: {
              error: { message: 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações' },
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(
      await screen.findByText('Token Meta expirado. Reconecte sua conta em Configurações > Integrações')
    ).toBeInTheDocument();
  });

  it('exibe fallback genérico quando a API falha sem mensagem de erro', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/v2/lead-campaigns') {
        return Promise.resolve({ data: { success: true, data: [FORM_CAMPAIGN] } });
      }
      if (url === '/v2/leads') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Não foi possível carregar os clientes. Tente novamente.')).toBeInTheDocument();
  });

  it('mostra skeleton enquanto carrega (substitui o spinner/texto de loading)', async () => {
    // Deixa a busca de leads pendente para observar o estado de loading.
    let resolveLeads: (v: unknown) => void;
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/v2/lead-campaigns') {
        return Promise.resolve({ data: { success: true, data: [FORM_CAMPAIGN] } });
      }
      if (url === '/v2/leads') {
        return new Promise((resolve) => { resolveLeads = resolve; });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<LeadsPage />, { wrapper: makeWrapper() });

    // Skeleton visível enquanto o agregado não resolve.
    const skeleton = screen.getByRole('status', { name: /carregando clientes/i });
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    // Ao menos uma barra de skeleton com pulse dentro.
    const bars = skeleton.querySelectorAll('.animate-pulse');
    expect(bars.length).toBeGreaterThan(0);
    // O texto antigo de loading não deve existir.
    expect(screen.queryByText(/carregando clientes\.\.\./i)).not.toBeNull();

    // Resolve → skeleton sai, a tabela aparece.
    resolveLeads!({ data: { success: true, data: [] } });
    await waitFor(() => expect(screen.queryByRole('status', { name: /carregando clientes/i })).toBeNull());
  });

  it('linha com telefone mostra botão WhatsApp abrindo wa.me com DDI 55', async () => {
    mockApi([
      {
        name: 'Ana Lima', email: 'ana@exemplo.com', phone: '11988887777',
        createdAt: '2026-09-21T09:00:00Z', campaignId: 'form_1', campaignName: 'Camp Formulário',
      },
    ]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Ana Lima')).toBeInTheDocument();
    // Botão/link de WhatsApp na coluna Ação.
    const waLink = screen.getByRole('link', { name: /whatsapp/i });
    expect(waLink).toHaveAttribute('href', 'https://wa.me/5511988887777');
    expect(waLink).toHaveAttribute('target', '_blank');
    expect(waLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('linha SEM telefone não mostra botão WhatsApp', async () => {
    mockApi([
      {
        name: 'Sem Telefone', email: 'sem@exemplo.com', phone: null,
        createdAt: '2026-09-21T09:00:00Z', campaignId: 'form_1', campaignName: 'Camp Formulário',
      },
    ]);

    render(<LeadsPage />, { wrapper: makeWrapper() });

    expect(await screen.findByText('Sem Telefone')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  });
});