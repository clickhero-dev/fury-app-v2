/*
Funcionalidade: criar cliente no painel superadmin

Cenário: conflito conhecido preserva o formulário
  Dado que a API informa conflito de slug ou e-mail
  Quando o superadmin envia o formulário
  Então a tela mostra uma mensagem específica e mantém o modal aberto

Cenário: falha inesperada usa mensagem genérica
  Dado que a API falha sem código de conflito
  Quando o superadmin envia o formulário
  Então a tela informa que não foi possível criar o cliente

Cenário: clique duplo não dispara duas criações
  Dado que a primeira criação ainda está em andamento
  Quando o superadmin clica novamente
  Então o segundo clique permanece desabilitado
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost } }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/tenants/:id" element={<div>detalhe</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Novo Cliente' }));
  await user.type(screen.getByLabelText('Nome do cliente'), 'Cliente novo');
  await user.type(screen.getByLabelText('Nome do Usuário'), 'Owner');
  await user.type(screen.getByLabelText('Email'), 'owner@example.com');
  await user.type(screen.getByLabelText('Senha'), 'SenhaSegura1!');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ platformRole: 'super_admin' }));
  mockGet.mockImplementation((url: string) => Promise.resolve(
    url.includes('/check-email/')
      ? { data: { data: { exists: false } } }
      : { data: { data: { users: [], total: 0, page: 1, pages: 1, limit: 10 } } },
  ));
});

describe('UsersPage — setup tenant', () => {
  it('Cenário: conflito conhecido explica a causa e preserva o modal', async () => {
    mockPost.mockRejectedValue({ response: { status: 409, data: { error: { code: 'SLUG_EXISTS' } } } });
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText(/Já existe um cliente com este identificador/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Novo Cliente' })).toBeTruthy();
  });

  it('Cenário: falha inesperada mostra a mensagem genérica', async () => {
    mockPost.mockRejectedValue({ response: { status: 500, data: { error: { code: 'INTERNAL_SERVER_ERROR' } } } });
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Não foi possível criar o cliente. Tente novamente.')).toBeTruthy();
  });

  it('Cenário: clique duplo não dispara duas criações', async () => {
    mockPost.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    const create = screen.getByRole('button', { name: 'Criar' });
    await user.click(create);
    expect(screen.getByRole('button', { name: 'Criando...' })).toHaveProperty('disabled', true);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
