/*
Funcionalidade: administrar créditos de imagem na assinatura de um cliente

Cenário: superadmin consulta o saldo limitado de créditos
  Dado que o cliente possui 2 de 10 créditos de imagem
  Quando o superadmin abre a aba Assinatura
  Então vê o saldo e a ação para renovar a cota

Cenário: superadmin consulta uma cota ilimitada
  Dado que o plano do cliente não limita créditos de imagem
  Quando o superadmin abre a aba Assinatura
  Então vê que os créditos são ilimitados e não pode renovar a cota

Cenário: superadmin renova a cota com sucesso
  Dado que o cliente possui uma cota limitada
  Quando o superadmin solicita a renovação
  Então a API administrativa é chamada e a tela confirma a renovação

Cenário: renovação de cota falha
  Dado que a API não consegue renovar a cota
  Quando o superadmin solicita a renovação
  Então a tela informa o erro e mantém a ação disponível
*/
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantDetailPage } from './TenantDetailPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/pages/configuracoes/LocationEditor', () => ({ LocationEditor: () => <div /> }));

function tenantResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      data: {
        id: 'tenant-1', name: 'Cliente', slug: 'cliente', createdAt: '2026-01-01', users: [],
        subscription: {
          id: 'sub-1', planId: 'plan-1', status: 'active', isNonExpirable: false,
          trialEndsAt: null, currentPeriodEnd: '2026-11-01T00:00:00.000Z', asaasSubscriptionId: '',
          creativesRemaining: 2,
          plan: { id: 'plan-1', name: 'Pro', priceCents: 9900, interval: 'month', limits: { creativesPerMonth: 10 } },
          ...overrides,
        },
        furyConfig: null, brandKit: null, goals: null, audienceDefaults: null, ownerUserId: null, businessContext: null,
      },
    },
  };
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/admin/tenants/tenant-1']}><Routes><Route path="/admin/tenants/:id" element={<TenantDetailPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => Promise.resolve(url === '/admin/plans' ? { data: { data: [] } } : tenantResponse()));
});

describe('TenantDetailPage — créditos de imagem', () => {
  it('mostra o saldo limitado e permite renovar a cota', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));

    expect(await screen.findByText('Créditos de imagem')).toBeInTheDocument();
    expect(screen.getByText('2 de 10 disponíveis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renovar cota' })).toBeEnabled();
  });

  it('mostra créditos ilimitados sem oferecer renovação', async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve(url === '/admin/plans' ? { data: { data: [] } } : tenantResponse({ creativesRemaining: null, plan: { id: 'plan-1', name: 'Enterprise', priceCents: 0, interval: 'month', limits: { creativesPerMonth: null } } })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));

    expect(await screen.findByText('Créditos ilimitados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Renovar cota' })).toBeNull();
  });

  it('renova a cota e confirma o sucesso', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));
    await user.click(await screen.findByRole('button', { name: 'Renovar cota' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tenants/tenant-1/reset-quota'));
    expect(await screen.findByText('Cota de créditos renovada')).toBeInTheDocument();
  });

  it('informa erro de renovação e mantém a ação disponível', async () => {
    mockPost.mockRejectedValue(new Error('Falha de rede'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));
    await user.click(await screen.findByRole('button', { name: 'Renovar cota' }));

    expect(await screen.findByText('Não foi possível renovar a cota. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renovar cota' })).toBeEnabled();
  });
});
