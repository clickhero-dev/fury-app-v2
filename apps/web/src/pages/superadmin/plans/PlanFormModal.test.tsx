import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlansPage } from '../PlansPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: vi.fn(), patch: mockPatch, delete: vi.fn() } }));

const plans = [
  { id: 'p1', name: 'Pro', priceCents: 39700, interval: 'monthly', features: {}, isActive: true, subscriberCount: 0,
    limits: { creativesPerMonth: 0, modificationsPerCreative: 3, videosPerMonth: 10, modificationsPerVideo: 0 } },
];

beforeEach(() => { vi.clearAllMocks(); mockGet.mockResolvedValue({ data: { data: plans } }); });

async function openEdit(user: ReturnType<typeof userEvent.setup>) {
  const card = await screen.findByRole('article', { name: 'Pro' });
  await user.click(within(card).getByRole('button', { name: 'Editar' }));
}

describe('PlanFormModal — ajustes', () => {
  it('modal não usa <form> (CSS claro forçava borda e fundo nos inputs)', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    expect(screen.getByRole('dialog').querySelector('form')).toBeNull();
  });

  it('não fecha durante o envio e o erro não vaza para a próxima abertura', async () => {
    let reject!: (e: Error) => void;
    mockPatch.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    await user.click(screen.getByRole('switch', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    reject(new Error('falha'));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Erro ao salvar');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openEdit(user);
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('erro de validação leva o foco ao campo', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await user.click(await screen.findByRole('button', { name: 'Novo Plano' }));
    await user.type(screen.getByLabelText('Nome do plano'), 'X');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(screen.getByLabelText('Preço (R$)')).toHaveFocus();
    expect(screen.getByText('O preço precisa ser maior que zero.')).toBeInTheDocument();
  });

  it('Enter num campo envia', async () => {
    mockPatch.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    await user.type(screen.getByLabelText('Nome do plano'), ' Max{Enter}');
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/admin/plans/p1', { name: 'Pro Max' }));
  });

  it('quantidade pode ser apagada e só é corrigida ao sair do campo', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    const input = screen.getByLabelText('Quantidade de modificações por criativo');
    await user.clear(input);
    expect(input).toHaveValue(null);
    await user.keyboard('0');
    expect(input).toHaveValue(0);
    await user.tab();
    expect(input).toHaveValue(1);

    await user.tripleClick(input);
    await user.keyboard('12');
    await user.tab();
    expect(input).toHaveValue(12);
  });

  it('clicar em Quantidade quando já está em Quantidade mantém o valor', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    const input = screen.getByLabelText('Quantidade de criativos por mês');
    expect(input).toHaveValue(0);
    await user.click(within(screen.getByRole('group', { name: 'Criativos por mês' })).getByRole('button', { name: 'Quantidade' }));
    expect(input).toHaveValue(0);
  });

  it('nome limitado a 100 caracteres, como na API', async () => {
    const user = userEvent.setup();
    render(<PlansPage />);
    await openEdit(user);
    expect(screen.getByLabelText('Nome do plano')).toHaveAttribute('maxLength', '100');
  });
});
