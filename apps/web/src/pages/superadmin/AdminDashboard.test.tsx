/*
Funcionalidade: localizar contas pela atividade administrativa

Cenário: abrir conta sem usuário a partir de uma renovação
  Dado uma renovação registrada para uma conta sem usuários ativos
  Quando o superadmin vê a atividade recente
  Então identifica que é uma conta e pode abrir seus detalhes
*/
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAdminPage } from './AdminDashboard';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockGet } }));

describe('DashboardAdminPage — atividade de conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        data: {
          mrrCents: 0,
          activeClients: 1,
          newClients: 0,
          activeTrials: 0,
          cancellations: 0,
          expiredAccounts: 0,
          plans: [],
          recentActivity: [{
            tipo: 'renovacao',
            tenantId: 'tenant-sem-usuario',
            tenantName: 'Jesus Cristo',
            description: 'a conta renovou o período do plano Intermediário',
            at: '2026-11-04T10:00:00.000Z',
          }],
        },
      },
    });
  });

  it('identifica a atividade como conta e oferece o detalhe administrativo', async () => {
    render(<MemoryRouter><DashboardAdminPage /></MemoryRouter>);

    const accountLink = await screen.findByRole('link', { name: 'Abrir conta Jesus Cristo' });
    expect(accountLink.getAttribute('href')).toBe('/admin/tenants/tenant-sem-usuario');
    expect(screen.getByText('a conta renovou o período do plano Intermediário')).toBeTruthy();
  });
});
