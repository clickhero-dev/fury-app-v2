/*
Funcionalidade: parceiro cadastra os próprios clientes

Cenário: vagas e Novo Cliente
  Dado que o parceiro usa 3 de 5 vagas
  Quando cria um cliente
  Então a API recebe os campos e o plano escolhido, e a lista recarrega

Cenário: limite atingido
  Dado que o parceiro usa 5 de 5 vagas
  Então o botão fica desligado e o aviso aparece
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientesPage } from './ClientesPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost } }));

const clients = [{ id: 't-1', name: 'Padaria X', userCount: 1, createdAt: '2026-10-01T00:00:00Z' }];

const plans = [
  { id: 'pl-2', name: 'Pro', isActive: true, createdAt: '2026-10-02T00:00:00Z' },
  { id: 'pl-1', name: 'Básico', isActive: true, createdAt: '2026-10-01T00:00:00Z' },
  { id: 'pl-0', name: 'Antigo', isActive: false, createdAt: '2026-09-01T00:00:00Z' },
];

function setup(usedTenants: number) {
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: { data: url === '/admin/my-partner' ? { id: 'p-1', name: 'Alfa', maxTenants: 5, usedTenants } : url === '/admin/plans' ? plans : clients } }),
  );
  render(<MemoryRouter><ClientesPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe('ClientesPage', () => {
  it('mostra vagas e cria cliente com o plano escolhido', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    setup(3);
    expect(await screen.findByText('3 de 5 vagas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Padaria X' })).toHaveAttribute('href', '/admin/tenants/t-1');

    await userEvent.click(screen.getByRole('button', { name: /novo cliente/i }));
    await userEvent.type(screen.getByLabelText('Nome da empresa'), 'Loja Y');
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@y.com');
    await userEvent.type(screen.getByLabelText(/Senha inicial/), 'Senha@123');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));

    // plano ativo mais antigo já vem marcado; desativado não aparece
    expect(screen.queryByRole('option', { name: 'Antigo' })).toBeNull();
    expect(mockPost).toHaveBeenCalledWith('/admin/my-partner/clients', {
      name: 'Loja Y', userName: 'Ana', userEmail: 'ana@y.com', userPassword: 'Senha@123', planId: 'pl-1',
    });
    expect(mockGet).toHaveBeenCalledTimes(6);
  });

  it('limite atingido: botão desligado e aviso', async () => {
    setup(5);
    expect(await screen.findByText(/Limite de clientes atingido \(5 de 5\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /novo cliente/i })).toBeDisabled();
  });

  it('erro da API aparece no formulário', async () => {
    mockPost.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { error: { message: 'Email já cadastrado' } } } }));
    setup(1);
    await userEvent.click(await screen.findByRole('button', { name: /novo cliente/i }));
    await userEvent.type(screen.getByLabelText('Nome da empresa'), 'Loja Y');
    await userEvent.type(screen.getByLabelText('Nome'), 'Ana');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@y.com');
    await userEvent.type(screen.getByLabelText(/Senha inicial/), 'Senha@123');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email já cadastrado');
  });
});
