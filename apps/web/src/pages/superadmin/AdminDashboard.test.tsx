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

describe('DashboardAdminPage — abas do super', () => {
  const ady = { mrrCents: 0, activeClients: 0, newClients: 0, activeTrials: 0, cancellations: 0, expiredAccounts: 0, plans: [], recentActivity: [] };
  const partners = {
    revenueCents: 1500000, activePartners: 2, newPartners: 1, slotsUsed: 3, slotsTotal: 8, partnerClientsActive: 2, partnerClientsTotal: 3,
    partners: [
      { id: 'p1', name: 'Parceiro A', paidCents: 500000, paidAt: '2026-11-10', usedTenants: 3, maxTenants: 5, activeClients: 2, aiKeyConfigured: true },
      { id: 'p2', name: 'Parceiro B', paidCents: null, paidAt: null, usedTenants: 0, maxTenants: 3, activeClients: 0, aiKeyConfigured: false },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async (url: string) => ({ data: { data: url === '/admin/dashboard/partners' ? partners : ady } }));
  });

  it('super vê as abas e os números dos parceiros', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
    render(<MemoryRouter><DashboardAdminPage /></MemoryRouter>);
    expect(await screen.findByText(/Só clientes que compram direto da ady/)).toBeTruthy();

    (await screen.findByRole('tab', { name: 'Parceiros' })).click();
    expect(await screen.findByText('R$ 15.000,00')).toBeTruthy();
    expect(screen.getByText('3 de 8')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Parceiro A' }).getAttribute('href')).toBe('/admin/parceiros/p1');
    expect(screen.getByText('10/11/2026')).toBeTruthy();
    expect(screen.getByText('Sem chave: clientes sem IA')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/admin/dashboard/partners', { params: { period: '30d' } });
    localStorage.removeItem('user');
  });

  it('parceiro não vê abas nem chama a rota de parceiros', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'admin_partner' }));
    render(<MemoryRouter><DashboardAdminPage /></MemoryRouter>);
    expect(await screen.findByText('Distribuição por Plano')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Parceiros' })).toBeNull();
    expect(mockGet).not.toHaveBeenCalledWith('/admin/dashboard/partners', expect.anything());
    localStorage.removeItem('user');
  });
});
