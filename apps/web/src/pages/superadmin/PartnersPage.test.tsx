/*
Funcionalidade: super_admin gerencia parceiros

Cenário: lista com vagas e chave
  Dado que existem parceiros cadastrados
  Quando o super_admin abre Parceiros
  Então vê as vagas usadas, a chave mascarada e o total no topo

Cenário: cria parceiro com a conta
  Quando preenche empresa, limite e a conta do parceiro
  Então a API recebe os dados e a lista recarrega

Cenário: limite abaixo dos clientes atuais
  Dado que o parceiro já tem 7 clientes
  Quando o limite digitado é 5
  Então o Salvar fica desligado e o aviso aparece
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnersPage } from './PartnersPage';
import { PartnerConfigPage } from './PartnerConfigPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost, patch: mockPatch } }));

const partnerA = { id: 'p-1', name: 'Parceira Um', maxTenants: 10, usedTenants: 7, accountEmail: 'um@x.com', keyLast4: 'a1b2' };
const partnerB = { id: 'p-2', name: 'Parceira Dois', maxTenants: 5, usedTenants: 0, accountEmail: 'dois@x.com', keyLast4: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) =>
    Promise.resolve({ data: { data: url === '/admin/partners' ? [partnerA, partnerB] : partnerA } }),
  );
});

describe('PartnersPage', () => {
  it('mostra vagas, chave mascarada e totais', async () => {
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);

    expect(await screen.findByText('Parceira Um')).toBeInTheDocument();
    expect(screen.getByText('•••• a1b2')).toBeInTheDocument();
    expect(screen.getByText('Sem chave')).toBeInTheDocument();
    expect(screen.getByText('7 de 15')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Configurar' })[0]).toHaveAttribute('href', '/admin/parceiros/p-1');
  });

  it('cria parceiro com a conta e recarrega a lista', async () => {
    mockPost.mockResolvedValue({ data: { data: partnerB } });
    const user = userEvent.setup();
    render(<MemoryRouter><PartnersPage /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: /novo parceiro/i }));
    await user.type(screen.getByLabelText('Nome da empresa'), 'Nova');
    await user.clear(screen.getByLabelText('Máximo de clientes'));
    await user.type(screen.getByLabelText('Máximo de clientes'), '3');
    await user.type(screen.getByLabelText('Nome'), 'Dona');
    await user.type(screen.getByLabelText('E-mail'), 'dona@x.com');
    await user.type(screen.getByLabelText(/senha inicial/i), 'SenhaForte1');
    await user.click(screen.getByRole('button', { name: 'Criar parceiro' }));

    expect(mockPost).toHaveBeenCalledWith('/admin/partners', {
      name: 'Nova', maxTenants: 3, accountName: 'Dona', accountEmail: 'dona@x.com', accountPassword: 'SenhaForte1',
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
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
});
