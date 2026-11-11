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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    expect(screen.getByRole('dialog', { name: 'Criar Usuário' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Usuário' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByTitle('Editar usuário'));
    expect(screen.queryByRole('option', { name: 'Usuário Titular' })).not.toBeInTheDocument();
    unmount();

    localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    expect(await screen.findByRole('option', { name: 'Usuário Titular' })).toBeInTheDocument();
  });

  it('com 2 membros o parceiro vê o aviso de limite e não consegue abrir a criação', async () => {
    partnerWithUsers([person('t', 'owner'), person('a', 'member'), person('b', 'member')]);
    renderPage();
    expect(await screen.findByText(/Limite de 2 usuários/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar Usuário' })).toBeDisabled();
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

  it('mostra a barra de créditos com o saldo do plano', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Assinatura' }));
    const bar = await screen.findByRole('progressbar', { name: 'Créditos disponíveis' });
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
  });
});

describe('TenantDetailPage — cards de seção', () => {
  it('abre em Usuários e troca o conteúdo ao escolher outro card', async () => {
    const user = userEvent.setup();
    renderPage();
    const usersCard = await screen.findByRole('button', { name: 'Usuários' });
    expect(usersCard).toHaveAttribute('aria-pressed', 'true');
    expect(usersCard).toHaveAccessibleDescription(/0 usuários/);

    await user.click(screen.getByRole('button', { name: 'Motor ADY' }));
    expect(screen.getByRole('button', { name: 'Motor ADY' })).toHaveAttribute('aria-pressed', 'true');
    expect(usersCard).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Meta de ROAS (x)')).toBeInTheDocument();
    expect(screen.getByLabelText('Utilização de Budget (%)')).toBeInTheDocument();
  });

  it('card de Assinatura resume plano e status', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Assinatura' })).toHaveAccessibleDescription('Pro Status: active');
  });

  it('salvar Metas mantém o mesmo payload da API', async () => {
    const { default: api } = await import('@/lib/api');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Metas' }));
    await user.selectOptions(screen.getByLabelText('Objetivo da campanha'), 'gerar_leads');
    await user.type(screen.getByLabelText('Nicho do negócio'), 'pet');
    await user.type(screen.getByLabelText('Orçamento mensal (R$)'), '500');
    await user.type(screen.getByLabelText('CPA alvo (R$)'), '20');
    await user.click(screen.getByRole('button', { name: /Salvar Metas/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/tenants/tenant-1/goals', {
      objective: 'gerar_leads', niche: 'pet', mainProduct: '', monthlyBudget: 500, targetCpa: 20,
    }));
  });
});

describe('TenantDetailPage — criar usuário e paginação', () => {
  function withUsers(users: object[]) {
    const base = tenantResponse();
    mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans')
      ? { data: { data: [] } }
      : { data: { data: { ...base.data.data, users } } }));
  }
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, name: `Pessoa ${i + 1}`, email: `p${i + 1}@x.com`, role: 'member', createdAt: '2026-01-01' }));

  it('cria no modal com o mesmo payload, fecha e confirma', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('Email'), 'ana@x.com');
    await user.type(screen.getByLabelText('Senha'), 'segredo123');
    await user.click(screen.getByRole('button', { name: /^Criar$/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/users', {
      name: 'Ana', email: 'ana@x.com', password: 'segredo123', role: 'member', tenantId: 'tenant-1',
    }));
    expect(await screen.findByText('Usuário criado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('erro ao criar fica dentro do modal, que continua aberto', async () => {
    mockPost.mockRejectedValue(new Error('falha'));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.click(screen.getByRole('button', { name: /^Criar$/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Criar Usuário' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro ao criar usuário');
  });

  it('fechar o modal descarta a senha digitada', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    await user.type(screen.getByLabelText('Senha'), 'segredo123');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar Usuário' }));
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('com até 9 usuários não mostra paginação', async () => {
    withUsers(many(9));
    renderPage();
    expect(await screen.findAllByTitle('Editar usuário')).toHaveLength(9);
    expect(screen.queryByRole('navigation', { name: 'Paginação de usuários' })).not.toBeInTheDocument();
  });

  it('acima de 9 usuários pagina de 9 em 9', async () => {
    withUsers(many(11));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findAllByTitle('Editar usuário')).toHaveLength(9);
    expect(screen.getByText('Mostrando 1–9 de 11')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getAllByTitle('Editar usuário')).toHaveLength(2);
    expect(screen.getByText('Pessoa 10')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 10–11 de 11')).toBeInTheDocument();
  });

  it('depois de criar vai para a última página', async () => {
    let users = many(9);
    const base = tenantResponse();
    mockGet.mockImplementation((url: string) => Promise.resolve(url.endsWith('/assignable-plans')
      ? { data: { data: [] } }
      : { data: { data: { ...base.data.data, users } } }));
    mockPost.mockImplementation(async () => {
      users = [...users, { id: 'novo', name: 'Nova Pessoa', email: 'nova@x.com', role: 'member', createdAt: '2026-01-02' }];
      return { data: { success: true } };
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Criar Usuário' }));
    await user.type(screen.getByLabelText('Nome'), 'Nova Pessoa');
    await user.click(screen.getByRole('button', { name: /^Criar$/ }));

    expect(await screen.findByText('Nova Pessoa')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 10–10 de 10')).toBeInTheDocument();
  });
});
