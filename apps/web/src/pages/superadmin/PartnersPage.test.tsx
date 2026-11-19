/*
Funcionalidade: super_admin gerencia parceiros

Cenário: lista com vagas e chave
  Dado que existem parceiros cadastrados
  Quando o super_admin abre Parceiros
  Então vê as vagas usadas, a chave mascarada e o total no topo

Cenário: cria parceiro com plano e conta
  Quando escolhe o plano e preenche empresa e a conta do parceiro
  Então a API recebe o plano (vagas só se mudarem) e a lista recarrega

Cenário: parceiro sem plano recebe um
  Quando escolhe o plano em Dados e confirma depois da espera
  Então a API vincula e a tela mostra o plano

Cenário: vagas abaixo do plano
  Quando reduz as vagas abaixo do plano
  Então só salva depois do modal com espera

Cenário: limite abaixo dos clientes atuais
  Dado que o parceiro já tem 7 clientes
  Quando o limite digitado é 5
  Então o Salvar fica desligado e o aviso aparece
*/
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnersPage } from './PartnersPage';
import { PartnerConfigPage } from './PartnerConfigPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: mockPatch, put: mockPut } }));

const partnerA = {
  id: 'p-1', name: 'Parceira Um', maxTenants: 10, usedTenants: 7, accountEmail: 'um@x.com', accountUserId: 'u-p1', keyLast4: 'a1b2',
  partnerPlanId: 'pl-1', partnerPlanName: 'Parceiro Ouro', partnerPlanPriceCents: 249990, partnerPlanMaxTenants: 10,
};
const ouro = { id: 'pl-1', name: 'Parceiro Ouro', priceCents: 249990, maxTenants: 5, isActive: true, blockedViews: [], partnersCount: 1 };
const inativo = { ...ouro, id: 'pl-2', name: 'Velho', isActive: false };
const partnerB = { id: 'p-2', name: 'Parceira Dois', maxTenants: 5, usedTenants: 0, accountEmail: 'dois@x.com', keyLast4: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: { data: url === '/admin/partners' ? [partnerA, partnerB] : url === '/admin/partner-plans' ? [ouro, inativo] : partnerA } }),
  );
});
afterEach(() => vi.useRealTimers());

describe('PartnersPage', () => {
  it('mostra vagas por parceiro e chave mascarada, sem card de vagas usadas', async () => {
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);

    expect(await screen.findByText('Parceira Um')).toBeInTheDocument();
    expect(screen.getByText('•••• a1b2')).toBeInTheDocument();
    expect(screen.getByText('Sem chave')).toBeInTheDocument();
    expect(screen.queryByText('Vagas usadas')).not.toBeInTheDocument();
    expect(screen.getByText('Clientes de parceiros')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Configurar' })[0]).toHaveAttribute('href', '/admin/parceiros/p-1');
    expect(screen.getByText('Parceiro Ouro')).toBeInTheDocument();
    expect(screen.getByText('Sem plano')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planos de parceiro' })).toHaveAttribute('href', '/admin/parceiros/planos');
  });

  it('cria parceiro com a conta e recarrega a lista', async () => {
    mockPost.mockResolvedValue({ data: { data: partnerB } });
    const user = userEvent.setup();
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: /novo parceiro/i }));
    await user.type(screen.getByLabelText('Nome da empresa'), 'Nova');
    // só planos ativos
    expect(await screen.findByRole('option', { name: /Parceiro Ouro/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Velho/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Plano do parceiro'), 'pl-1');
    expect(screen.getByLabelText('Máximo de clientes')).toHaveValue(5);
    await user.type(screen.getByLabelText('Nome'), 'Dona');
    await user.type(screen.getByLabelText('E-mail'), 'dona@x.com');
    await user.type(screen.getByLabelText(/senha inicial/i), 'SenhaForte1');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText(/senha inicial/i)).toHaveAttribute('type', 'text');
    expect(mockPost).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Criar parceiro' }));

    // vagas iguais às do plano: não envia ajuste
    expect(mockPost).toHaveBeenCalledWith('/admin/partners', {
      name: 'Nova', partnerPlanId: 'pl-1', accountName: 'Dona', accountEmail: 'dona@x.com', accountPassword: 'SenhaForte1',
    });
    expect(mockGet).toHaveBeenCalledWith('/admin/partners');
  });

  it('falha ao carregar planos mostra o motivo e tenta de novo (não diz "nenhum plano")', async () => {
    let fail = true;
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/partner-plans' && fail) {
        fail = false;
        return Promise.reject(Object.assign(new Error('500'), { isAxiosError: true, response: { status: 500, data: { error: { message: 'Banco indisponível' } } } }));
      }
      return Promise.resolve({ data: { data: url === '/admin/partners' ? [partnerA, partnerB] : [ouro] } });
    });
    const user = userEvent.setup();
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /novo parceiro/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os planos de parceiro');
    expect(screen.queryByText(/Cadastre um plano/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('option', { name: /Parceiro Ouro/ })).toBeInTheDocument();
  });

  it('vagas apagadas não viram 0: pede um número', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /novo parceiro/i }));
    await user.type(screen.getByLabelText('Nome da empresa'), 'Nova');
    await screen.findByRole('option', { name: /Parceiro Ouro/ });
    await user.selectOptions(screen.getByLabelText('Plano do parceiro'), 'pl-1');
    await user.clear(screen.getByLabelText('Máximo de clientes'));
    await user.type(screen.getByLabelText('Nome'), 'Dona');
    await user.type(screen.getByLabelText('E-mail'), 'dona@x.com');
    await user.type(screen.getByLabelText(/senha inicial/i), 'SenhaForte1');
    // required do campo bloqueia o envio nativo; o submit direto mostra o motivo
    screen.getByRole('button', { name: 'Criar parceiro' }).closest('form')!.noValidate = true;
    await user.click(screen.getByRole('button', { name: 'Criar parceiro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o máximo de clientes');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('vagas diferentes das do plano vão como ajuste individual', async () => {
    mockPost.mockResolvedValue({ data: { data: partnerB } });
    const user = userEvent.setup();
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /novo parceiro/i }));
    await user.type(screen.getByLabelText('Nome da empresa'), 'Nova');
    await screen.findByRole('option', { name: /Parceiro Ouro/ });
    await user.selectOptions(screen.getByLabelText('Plano do parceiro'), 'pl-1');
    await user.clear(screen.getByLabelText('Máximo de clientes'));
    await user.type(screen.getByLabelText('Máximo de clientes'), '8');
    await user.type(screen.getByLabelText('Nome'), 'Dona');
    await user.type(screen.getByLabelText('E-mail'), 'dona@x.com');
    await user.type(screen.getByLabelText(/senha inicial/i), 'SenhaForte1');
    await user.click(screen.getByRole('button', { name: 'Criar parceiro' }));
    expect(mockPost).toHaveBeenCalledWith('/admin/partners', expect.objectContaining({ partnerPlanId: 'pl-1', maxTenants: 8 }));
  });
});

describe('PartnerConfigPage', () => {
  it('não deixa salvar limite abaixo dos clientes atuais', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/parceiros/p-1']}>
        <Routes><Route path="/admin/parceiros/:id" element={<PartnerConfigPage />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('tab', { name: 'Limites' }));
    const input = screen.getByLabelText('Máximo de clientes');
    await user.clear(input);
    await user.type(input, '5');

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByText(/menor que os 7 clientes atuais/)).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  const renderConfig = () =>
    render(
      <MemoryRouter initialEntries={['/admin/parceiros/p-1']}>
        <Routes><Route path="/admin/parceiros/:id" element={<PartnerConfigPage />} /></Routes>
      </MemoryRouter>,
    );

  it('troca a senha da conta do parceiro em Dados da empresa', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Trocar senha' }));
    const dialog = screen.getByRole('dialog', { name: 'Trocar senha' });
    await user.type(within(dialog).getByLabelText('Nova senha'), 'NovaSenha#1');
    await user.type(within(dialog).getByLabelText('Confirmar senha'), 'NovaSenha#1');
    await user.click(within(dialog).getByRole('button', { name: /Trocar senha/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/users/u-p1/password', { password: 'NovaSenha#1' }));
    expect(await screen.findByText('Senha do parceiro alterada')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sem conta de parceiro não mostra o botão de senha', async () => {
    mockGet.mockResolvedValue({ data: { data: { ...partnerA, accountEmail: null, accountUserId: null } } });
    renderConfig();
    expect(await screen.findByRole('tab', { name: 'Dados da empresa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar senha' })).not.toBeInTheDocument();
  });

  it('mostra o plano comprado em Dados', async () => {
    renderConfig();
    expect(await screen.findByText(/Parceiro Ouro · R\$ 2.499,90/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular' })).not.toBeInTheDocument();
  });

  it('parceiro sem plano: vincula depois da espera de 5s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const legacy = { ...partnerA, partnerPlanId: null, partnerPlanName: null, partnerPlanPriceCents: null, partnerPlanMaxTenants: null };
    mockGet.mockImplementation((url: string) => Promise.resolve({ data: { data: url === '/admin/partner-plans' ? [ouro, inativo] : legacy } }));
    mockPut.mockResolvedValue({ data: { data: { ...partnerA, maxTenants: 5 } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConfig();
    expect(await screen.findByText('Sem plano: vincule um')).toBeInTheDocument();
    await screen.findByRole('option', { name: /Parceiro Ouro/ });
    await user.selectOptions(screen.getByLabelText('Plano para vincular'), 'pl-1');
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    const dialog = screen.getByRole('dialog', { name: 'Vincular plano' });
    expect(within(dialog).getByRole('button', { name: /Aguarde 5s/ })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(5000);
    await user.click(within(dialog).getByRole('button', { name: 'Sim, vincular' }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/admin/partners/p-1/plan', { partnerPlanId: 'pl-1' }));
    expect(await screen.findByText('Plano vinculado')).toBeInTheDocument();
  });

  it('vagas abaixo do plano: só salva depois do modal com espera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue({ data: { data: { ...partnerA, usedTenants: 2 } } });
    mockPatch.mockResolvedValue({ data: { data: { ...partnerA, usedTenants: 2, maxTenants: 6 } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderConfig();
    await user.click(await screen.findByRole('tab', { name: 'Limites' }));
    const input = screen.getByLabelText('Máximo de clientes');
    await user.clear(input);
    await user.type(input, '6');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const dialog = screen.getByRole('dialog', { name: 'Reduzir vagas' });
    expect(mockPatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    await user.click(within(dialog).getByRole('button', { name: 'Sim, reduzir' }));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/admin/partners/p-1', { maxTenants: 6 }));
  });
});
