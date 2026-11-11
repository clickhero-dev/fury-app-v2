/*
Funcionalidade: administrar planos em cards

Cenário: listagem
  Dado que existem planos cadastrados
  Então cada um aparece num card com preço, limites e assinantes, sem ID nem features

Cenário: criar plano pelo modal
  Quando preencho o modal de Novo Plano e confirmo
  Então a API recebe o mesmo payload de antes e o modal fecha

Cenário: editar plano pelo modal
  Quando altero só alguns campos
  Então só eles vão no PATCH

Cenário: deletar plano com assinantes
  Então é preciso migrar antes de deletar
*/
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlansPage } from './PlansPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: mockPatch, delete: mockDelete } }));

const plans = [
  { id: 'pln-starter', name: 'Starter', priceCents: 19700, interval: 'monthly', features: { a: true }, isActive: true, subscriberCount: 3,
    limits: { creativesPerMonth: 40, modificationsPerCreative: 3 } },
  { id: 'pln-pro', name: 'Pro', priceCents: 39700, interval: 'yearly', features: {}, isActive: false, subscriberCount: 0,
    limits: { creativesPerMonth: null, modificationsPerCreative: null, videosPerMonth: 10, modificationsPerVideo: 2 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: { data: plans } });
});

describe('PlansPage', () => {
  it('lista os planos em cards sem ID nem features', async () => {
    render(<PlansPage />);
    const starter = await screen.findByRole('article', { name: 'Starter' });
    expect(within(starter).getByText('BÁSICO')).toBeInTheDocument();
    expect(within(starter).getByText('R$ 197,00')).toBeInTheDocument();
    expect(within(starter).getByText('Mensal')).toBeInTheDocument();
    expect(within(starter).getByText('Sem vídeo')).toBeInTheDocument();
    expect(within(starter).getByText('3 assinantes')).toBeInTheDocument();
    expect(within(starter).queryByText(/ID:/)).not.toBeInTheDocument();
    expect(within(starter).queryByText(/Features/)).not.toBeInTheDocument();

    const pro = screen.getByRole('article', { name: 'Pro' });
    expect(within(pro).getByText('Inativo')).toBeInTheDocument();
    expect(within(pro).getByText('Anual')).toBeInTheDocument();
    expect(within(pro).getAllByText('Sem limite')).toHaveLength(2);
    expect(screen.getByText('2 planos cadastrados')).toBeInTheDocument();
  });

  it('cria pelo modal com o mesmo payload e fecha', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<PlansPage />);
    await user.click(await screen.findByRole('button', { name: 'Novo Plano' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo Plano' });
    await user.type(within(dialog).getByLabelText('Nome do plano'), 'Agência');
    await user.type(within(dialog).getByLabelText('Preço (R$)'), '29900');
    await user.click(within(dialog).getByRole('button', { name: 'Anual' }));
    await user.click(within(within(dialog).getByRole('group', { name: 'Criativos por mês' })).getByRole('button', { name: 'Quantidade' }));
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/plans', {
      name: 'Agência', priceCents: 29900, interval: 'yearly', isActive: true,
      limits: { creativesPerMonth: 10, modificationsPerCreative: null, videosPerMonth: 0, modificationsPerVideo: 0 },
    }));
    expect(await screen.findByText('Plano criado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não cria sem nome e preço, e mostra o erro no campo', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await user.click(await screen.findByRole('button', { name: 'Novo Plano' }));
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByText('Informe o nome do plano.')).toBeInTheDocument();
    expect(screen.getByText('O preço precisa ser maior que zero.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('edita pelo modal e envia só o que mudou', async () => {
    mockPatch.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<PlansPage />);
    const starter = await screen.findByRole('article', { name: 'Starter' });
    await user.click(within(starter).getByRole('button', { name: 'Editar' }));

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Aumentar Criativos por mês' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/admin/plans/pln-starter', {
      isActive: false,
      limits: { creativesPerMonth: 41, modificationsPerCreative: 3, videosPerMonth: 0, modificationsPerVideo: 0 },
    }));
    expect(await screen.findByText('Plano atualizado')).toBeInTheDocument();
  });

  it('erro ao salvar fica no modal', async () => {
    mockPatch.mockRejectedValue(new Error('falha'));
    const user = userEvent.setup();
    render(<PlansPage />);
    const pro = await screen.findByRole('article', { name: 'Pro' });
    await user.click(within(pro).getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('switch', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Erro ao salvar');
  });

  it('Sem vídeo trava as modificações de vídeo', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    const pro = await screen.findByRole('article', { name: 'Pro' });
    await user.click(within(pro).getByRole('button', { name: 'Editar' }));
    await user.click(within(screen.getByRole('group', { name: 'Vídeos por mês' })).getByRole('button', { name: 'Sem vídeo' }));
    const mods = screen.getByRole('group', { name: 'Modificações por vídeo' });
    within(mods).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
  });

  it('plano com assinantes exige migrar antes de deletar', async () => {
    mockDelete.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<PlansPage />);
    const starter = await screen.findByRole('article', { name: 'Starter' });
    await user.click(within(starter).getByRole('button', { name: 'Deletar plano' }));
    const migrate = screen.getByRole('button', { name: 'Migrar e deletar' });
    expect(migrate).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox'), 'pln-pro');
    await user.click(migrate);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/admin/plans/pln-starter?migrateTo=pln-pro'));
  });
});
