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

Cenário: parceiro administra a assinatura do próprio cliente
  Dado que quem abre a aba Assinatura é um parceiro (admin_partner)
  Então vê Salvar e Renovar cota, e só os planos que dá para atribuir a este cliente

Cenário: renovação de cota falha
  Dado que a API não consegue renovar a cota
  Quando o superadmin solicita a renovação
  Então a tela informa o erro e mantém a ação disponível
*/
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantDetailPage } from './TenantDetailPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: vi.fn(), put: vi.fn(), delete: mockDelete } }));
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
  localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
  mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans') ? { data: { data: [] } } : tenantResponse()));
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

  it('parceiro administra a assinatura com os planos do cliente', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'admin_partner' }));
    mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans')
      ? { data: { data: [{ id: 'plan-p', name: 'Básico Parceiro', priceCents: 5000, interval: 'monthly', isActive: true }] } }
      : tenantResponse()));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));

    expect(await screen.findByText('2 de 10 disponíveis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renovar cota' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Básico Parceiro/ })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/tenants/tenant-1/assignable-plans');
    expect(mockGet).not.toHaveBeenCalledWith('/admin/plans');
  });

  function partnerWithUsers(users: object[]) {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'admin_partner' }));
    const base = tenantResponse();
    mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans')
      ? { data: { data: [] } }
      : { data: { data: { ...base.data.data, users } } }));
  }
  const person = (id: string, role: string) => ({ id, name: `U ${id}`, email: `${id}@x.com`, role, createdAt: '2026-01-01' });

  it('parceiro não vê cargo ao criar nem ao editar; super vê', async () => {
    partnerWithUsers([person('t', 'owner')]);
    const user = userEvent.setup();
    const { unmount } = renderPage();
    expect(await screen.findByText('Criar Usuário')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Usuário' })).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Editar usuário'));
    expect(screen.queryByRole('option', { name: 'Usuário Titular' })).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
    renderPage();
    expect(await screen.findByRole('option', { name: 'Usuário Titular' })).toBeInTheDocument();
  });

  it('com 2 membros o parceiro vê o aviso de limite no lugar do formulário', async () => {
    partnerWithUsers([person('t', 'owner'), person('a', 'member'), person('b', 'member')]);
    renderPage();
    expect(await screen.findByText(/Limite de 2 usuários/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Senha')).not.toBeInTheDocument();
  });

  it('remover titular: avisa que sai tudo e só libera a confirmação após 5 segundos', async () => {
    partnerWithUsers([person('t', 'owner'), person('a', 'member')]);
    renderPage();
    const buttons = await screen.findAllByTitle('Remover usuário');
    vi.useFakeTimers();
    try {
      fireEvent.click(buttons[0]!);
      expect(screen.getByRole('alert')).toHaveTextContent(/todos os usuários vinculados/);
      expect(screen.getByRole('button', { name: 'Aguarde 5s' })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(4000); });
      expect(screen.getByRole('button', { name: 'Aguarde 1s' })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(screen.getByRole('button', { name: /Sim, remover tudo/ })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falha ao remover titular: erro aparece no modal e a contagem recomeça', async () => {
    mockDelete.mockRejectedValue(new Error('falha'));
    partnerWithUsers([person('t', 'owner')]);
    renderPage();
    const buttons = await screen.findAllByTitle('Remover usuário');
    vi.useFakeTimers();
    try {
      fireEvent.click(buttons[0]!);
      act(() => { vi.advanceTimersByTime(5000); });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Sim, remover tudo/ }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Não foi possível remover. Tente novamente.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aguarde 5s' })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('remover membro não mostra o aviso do titular', async () => {
    partnerWithUsers([person('t', 'owner'), person('a', 'member')]);
    renderPage();
    const buttons = await screen.findAllByTitle('Remover usuário');
    fireEvent.click(buttons[1]!);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sim, remover/ })).toBeEnabled();
  });

  it('mostra créditos ilimitados sem oferecer renovação', async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans') ? { data: { data: [] } } : tenantResponse({ creativesRemaining: null, plan: { id: 'plan-1', name: 'Enterprise', priceCents: 0, interval: 'month', limits: { creativesPerMonth: null } } })));
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
