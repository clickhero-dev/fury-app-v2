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

const PARTNERS = [{ id: 'p-1', name: 'Parceiro Alfa', maxTenants: 5 }];
const USERS = [
  { id: 'u-1', name: 'Ana', email: 'ana@x.com', role: 'owner', platformRole: 'user', tenantId: 't-1', tenantName: 'Loja Ana', partnerName: null, createdAt: '2026-11-01T00:00:00Z' },
  { id: 'u-2', name: 'Beto', email: 'beto@x.com', role: 'owner', platformRole: 'user_partner', tenantId: 't-2', tenantName: 'Loja Beto', partnerName: 'Parceiro Alfa', createdAt: '2026-11-02T00:00:00Z' },
];
const lastUsersUrl = () => [...mockGet.mock.calls].reverse().map(([url]) => url as string).find((url) => url.startsWith('/admin/users?'));

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
  await user.click(await screen.findByRole('button', { name: 'Novo cliente ady' }));
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
      : url === '/admin/partners'
        ? { data: { data: PARTNERS } }
        : { data: { data: { users: USERS, total: USERS.length, page: 1, pages: 1, limit: 10 } } },
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
    expect(screen.getByRole('heading', { name: 'Novo cliente ady' })).toBeTruthy();
    expect(screen.getByText(/Cria um cliente e um usuário da ady/)).toBeTruthy();
  });

  it('Cenário: novo cliente nasce sempre com o titular, sem seletor de cargo', async () => {
    mockPost.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    expect(screen.queryByLabelText('Cargo')).toBeNull();
    expect(document.body).toHaveTextContent('Cargo: Usuário Titular');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(mockPost).toHaveBeenCalledWith('/admin/setup-tenant', expect.not.objectContaining({ userRole: expect.anything() }));
  });

  it('Cenário: falha inesperada mostra a mensagem genérica', async () => {
    mockPost.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { error: { code: 'INTERNAL_SERVER_ERROR' } } } });
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Não foi possível criar o cliente. Erro no servidor. Tente de novo; se continuar, fale com o suporte.')).toBeTruthy();
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

it('Dado um novo cliente, quando revelo sua senha, então o formulário não é enviado', async () => {
  const user = userEvent.setup();
  renderPage();
  await fillForm(user);
  await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
  expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
  expect(screen.getByLabelText('Senha')).toHaveValue('SenhaSegura1!');
  expect(mockPost).not.toHaveBeenCalled();
});

describe('UsersPage — falha ao listar', () => {
  it('mostra o motivo em vez de lista vazia', async () => {
    mockGet.mockImplementation((url: string) => (url === '/admin/partners' ? Promise.resolve({ data: { data: PARTNERS } }) : Promise.reject({ isAxiosError: true })));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Não foi possível carregar os usuários\. Sem conexão com o servidor/);
  });
});

describe('UsersPage — filtros e ordem', () => {
  it('cargo, origem e ordem vão para a API e voltam para a página 1', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Loja Ana');
    await user.selectOptions(screen.getByLabelText('Filtrar por cargo'), 'member');
    expect(lastUsersUrl()).toBe('/admin/users?page=1&limit=10&role=member');
    await user.selectOptions(await screen.findByLabelText('Filtrar por origem'), 'Parceiro Alfa');
    expect(lastUsersUrl()).toBe('/admin/users?page=1&limit=10&role=member&origin=p-1');
    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'role');
    expect(lastUsersUrl()).toBe('/admin/users?page=1&limit=10&role=member&origin=p-1&sort=role');
  });

  it('coluna Origem mostra ady ou o nome do parceiro', async () => {
    renderPage();
    const beto = (await screen.findByText('Loja Beto')).closest('tr')!;
    expect(beto).toHaveTextContent('Parceiro Alfa');
    expect(screen.getByText('Loja Ana').closest('tr')).toHaveTextContent(/ady/);
  });

  it('limpar filtros zera cargo, origem, ordem e busca', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Loja Ana');
    await user.selectOptions(screen.getByLabelText('Filtrar por cargo'), 'owner');
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(lastUsersUrl()).toBe('/admin/users?page=1&limit=10');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
  });

  it('parceiro não vê o filtro de origem nem a coluna, e não busca a lista de parceiros', async () => {
    localStorage.setItem('user', JSON.stringify({ platformRole: 'admin_partner' }));
    renderPage();
    await screen.findByText('Loja Ana');
    expect(screen.queryByLabelText('Filtrar por origem')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Origem' })).toBeNull();
    expect(mockGet).not.toHaveBeenCalledWith('/admin/partners');
  });

  it('falha ao buscar parceiros avisa sem esconder a lista', async () => {
    mockGet.mockImplementation((url: string) => (url === '/admin/partners'
      ? Promise.reject({ isAxiosError: true })
      : Promise.resolve({ data: { data: { users: USERS, total: 2, page: 1, pages: 1, limit: 10 } } })));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Não foi possível carregar os parceiros do filtro/);
    expect(screen.getByText('Loja Ana')).toBeTruthy();
  });
});
