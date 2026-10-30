/*
 * Funcionalidade: dashboard global do superadmin
 * Cenário: retrato de vencidos e limitação de renovações são visíveis
 * Dado que a API retorna contas vencidas e não possui eventos confiáveis de renovação
 * Quando o superadmin abre o dashboard
 * Então vê a quantidade de contas vencidas e o aviso de disponibilidade limitada
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { DashboardAdminPage } from './AdminDashboard';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn() },
}));

describe('DashboardAdminPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        data: {
          mrrCents: 10000,
          activeClients: 2,
          newClients: 1,
          activeTrials: 1,
          cancellations: 0,
          expiredAccounts: 2,
          renewalActivityCoverage: 'unavailable',
          plans: [],
          recentActivity: [],
        },
      },
    });
  });

  it('exibe contas vencidas e informa que renovações não têm cobertura histórica', async () => {
    render(<DashboardAdminPage />);

    await waitFor(() => expect(screen.getByText('Contas com plano vencido')).toBeInTheDocument());
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText(/renovações não estão disponíveis no histórico/i)).toBeInTheDocument();
  });
});
