// =============================================================================
// BDD — T007: Dashboard consome endpoints v2 (queries do Dashboard.tsx)
//
/*
# Language: pt-BR

Funcionalidade: Dashboard passa a chamar /v2/* para dados Meta do banco

  Cenário: instagram-insights, summary e daily usam /v2
    Dado o Dashboard montado com api mockada
    Quando as queries executam
    Então api.get é chamado com '/v2/dashboard/instagram-insights'
    E api.get é chamado com '/v2/metrics/summary'
    E api.get é chamado com '/v2/metrics/daily'

  Cenário: /metrics/campaigns (sem equivalente v2) permanece intacto
    Dado o Dashboard montado
    Quando a query de campanhas ativas executa
    Então api.get é chamado com '/metrics/campaigns' (não v2)

  Cenário: métricas não exibem valores antigos enquanto o novo período carrega
    Dado que o resumo do período atual já foi carregado
    Quando o usuário seleciona outro período e a consulta fica pendente
    Então o conteúdo do Dashboard é substituído por skeleton
    E os valores anteriores reaparecem substituídos pelos novos quando a consulta termina
*/
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Dashboard } from './Dashboard';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockUseGoalsProgress = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useGoalsProgress', () => ({
  useGoalsProgress: (...args: unknown[]) => mockUseGoalsProgress(...args),
  translateObjective: (k?: string) => k ?? 'Seu Objetivo',
}));

vi.mock('@/components', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: () => <div>Dashboard</div>,
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('recharts', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: passthrough,
    LineChart: passthrough,
    Line: passthrough,
    XAxis: passthrough,
    YAxis: passthrough,
    CartesianGrid: passthrough,
    Tooltip: passthrough,
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BDD: Dashboard usa endpoints v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGoalsProgress.mockReturnValue({ data: null, isFetching: false, isLoading: false });
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/v2/dashboard/instagram-insights') {
        return Promise.resolve({ data: { success: true, data: { comments: 1, saves: 2, followers: 0 } } });
      }
      if (url === '/v2/metrics/summary') {
        return Promise.resolve({ data: { success: true, data: { summary: { spend: 100, roas: 1, cpa: 20, conversions: 5 } } } });
      }
      if (url === '/v2/metrics/daily') {
        return Promise.resolve({ data: { success: true, data: [{ date: '2026-09-01', spend: 10, conversions: 1, roas: 1, clicks: 5, impressions: 100 }] } });
      }
      if (url === '/metrics/campaigns') {
        return Promise.resolve({ data: { success: true, data: { campaigns: [], partial_failures: [] } } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
  });

  it('Cenário: instagram-insights, summary e daily usam /v2', async () => {
    render(<Dashboard />, { wrapper });

    await waitFor(() => expect(mockApiGet.mock.calls.some((c) => c[0] === '/v2/dashboard/instagram-insights')).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(mockApiGet.mock.calls.some((c) => c[0] === '/v2/metrics/summary')).toBe(true), { timeout: 5000 });
    await waitFor(() => expect(mockApiGet.mock.calls.some((c) => c[0] === '/v2/metrics/daily')).toBe(true), { timeout: 5000 });
  });

  it('Cenário: /metrics/campaigns (sem v2) permanece intacto', async () => {
    render(<Dashboard />, { wrapper });

    await waitFor(() => expect(mockApiGet.mock.calls.some((c) => c[0] === '/metrics/campaigns')).toBe(true), { timeout: 5000 });
    const urls = mockApiGet.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u === '/v2/metrics/campaigns')).toBe(false);
  });

  it('mostra skeleton para o Dashboard inteiro enquanto o novo período está carregando', async () => {
    const { getPeriodDates } = await import('@/lib/period-utils');
    const nextPeriod = getPeriodDates('last_7d');
    let resolveSummary!: (value: { data: { success: boolean; data: { summary: { spend: number; roas: number; cpa: number; conversions: number } } } }) => void;
    let nextPeriodLoaded = false;
    const goal = { metric: 'conversions', unit: 'pessoas', current_value: 5, target_value: 10, projected_value: 8, sparkline: [] };
    mockUseGoalsProgress.mockImplementation((startDate: string) => ({
      data: { hasGoals: true, objective: 'gerar_leads', goals: [goal], primary_goal: goal, ideal_line: [] },
      isLoading: false,
      isFetching: startDate === nextPeriod.startDate && !nextPeriodLoaded,
    }));
    mockApiGet.mockImplementation((url: string, config?: { params?: { startDate?: string } }) => {
      if (url === '/v2/metrics/summary' && config?.params?.startDate === nextPeriod.startDate) {
        return new Promise((resolve) => { resolveSummary = resolve; });
      }
      if (url === '/v2/metrics/summary') {
        return Promise.resolve({ data: { success: true, data: { summary: { spend: 140, roas: 1, cpa: 20, conversions: 5 } } } });
      }
      if (url === '/v2/metrics/daily') return Promise.resolve({ data: { success: true, data: [] } });
      if (url === '/v2/dashboard/instagram-insights') return Promise.resolve({ data: { success: true, data: null } });
      if (url === '/metrics/campaigns') return Promise.resolve({ data: { success: true, data: { campaigns: [], partial_failures: [] } } });
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    render(<Dashboard />, { wrapper });
    expect(await screen.findByText('R$ 140,00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    expect(await screen.findByRole('status', { name: /carregando dados do dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText('R$ 140,00')).not.toBeInTheDocument();

    nextPeriodLoaded = true;
    resolveSummary({ data: { success: true, data: { summary: { spend: 210, roas: 2, cpa: 15, conversions: 14 } } } });
    expect(await screen.findByText('R$ 210,00')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: /carregando dados do dashboard/i })).not.toBeInTheDocument());
  });
});
