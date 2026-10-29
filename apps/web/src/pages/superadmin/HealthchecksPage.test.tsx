/*
Funcionalidade: diagnosticar integrações Meta no superadmin

  Cenário: busca e pagina usuários em cards com estado visual
    Dado mais de nove integrações cadastradas
    Quando abre Healthchecks e pesquisa
    Então vê até dez cards por página com cor e estado de saúde

  Cenário: abre detalhes do healthcheck em modal
    Dado usuário com resultado anterior
    Quando clica no card
    Então vê detalhes e pode executar nova validação

  Cenário: filtrar status em conjunto com a busca
    Dado clientes com estados diferentes
    Quando seleciona Falha e pesquisa Pessoa 3
    Então vê somente clientes que correspondem aos dois critérios

  Cenário: filtrar clientes sem validação
    Dado que há clientes sem status
    Quando seleciona Não validado
    Então vê somente esses clientes

  Cenário: selecionar Saudável e Parcial e remover o filtro
    Dado que há clientes Saudável, Parcial e Falha
    Quando seleciona Saudável e depois Parcial
    Então vê somente clientes de cada estado selecionado
    Quando volta para Todos os status
    Então vê novamente a lista completa

  Cenário: reiniciar paginação ao filtrar
    Dado que o superadmin está na segunda página
    Quando seleciona Falha
    Então a lista filtrada começa na primeira página
    E vê os resultados filtrados dessa página

  Cenário: mostrar vazio quando nenhum cliente corresponde
    Dado que a combinação de filtros não encontra clientes
    Quando o superadmin aplica os filtros
    Então vê uma mensagem clara de lista vazia
*/
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthchecksPage } from './HealthchecksPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, post: mockPost } }));

const userRow = { userId: 'u1', name: 'Ana', email: 'ana@example.com', tenantId: 't1', tenantName: 'Loja Ana', connectionId: 'c1', adAccountId: 'act_1', status: 'partial', checkedAt: '2026-10-06T10:00:00.000Z', lastSyncStatus: 'partial', lastSyncAt: '2026-10-06T09:00:00.000Z' };
const rows = [userRow, ...Array.from({ length: 11 }, (_, index) => ({
  ...userRow,
  userId: `u${index + 2}`,
  name: `Pessoa ${index + 2}`,
  email: `pessoa${index + 2}@example.com`,
  tenantId: `t${index + 2}`,
  tenantName: `Loja ${index + 2}`,
  status: index === 0 ? 'success' : index === 1 ? 'failed' : null,
}))];
const result = { tenantId: 't1', checkedAt: '2026-10-06T10:00:00.000Z', status: 'partial', checks: {
  connection: { status: 'success' }, token: { status: 'success' }, metaBlocked: { status: 'success' },
  instagramPublish: { status: 'success' }, leadFormCampaigns: { status: 'failed', reason: 'Permissão ausente.' }, metrics: { status: 'success' },
}, lastSync: { status: 'partial', startedAt: '2026-10-06T09:00:00.000Z' } };

function setupApi() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/healthchecks/users') return Promise.resolve({ data: { data: rows } });
    if (url.startsWith('/admin/healthchecks?')) return Promise.resolve({ data: { data: { user: userRow, result } } });
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
  mockPost.mockResolvedValue({ data: { data: result } });
}

describe('HealthchecksPage', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); setupApi(); });

  it('mostra nove cards por página e pagina os demais', async () => {
    render(<HealthchecksPage />);

    expect(await screen.findByRole('button', { name: /Ana.*Loja Ana/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /saúde/ })).toHaveLength(9);
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByRole('button', { name: /Pessoa 12.*Loja 12/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /saúde/ })).toHaveLength(3);
  });

  it('filtra os cards por nome, email ou tenant', async () => {
    render(<HealthchecksPage />);
    const search = await screen.findByRole('searchbox', { name: 'Pesquisar usuários' });
    await userEvent.setup().type(search, 'pessoa12');
    expect(screen.getByRole('button', { name: /Pessoa 12.*Loja 12/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana.*Loja Ana/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
  });

  it('abre modal com detalhes e executa healthcheck sob demanda', async () => {
    render(<HealthchecksPage />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /Ana.*Loja Ana/ }));
    const dialog = await screen.findByRole('dialog', { name: /Healthcheck da Meta.*Ana/ });
    expect(within(dialog).getByText('Formulário de leads')).toBeInTheDocument();
    expect(within(dialog).getByText('Permissão ausente.')).toBeInTheDocument();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Executar healthcheck' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/healthchecks/run', { userId: 'u1' }));
  });

  it('apresenta estado de saúde acessível nos cards', async () => {
    render(<HealthchecksPage />);
    const card = await screen.findByRole('button', { name: /Ana.*Loja Ana/ });
    expect(card).toHaveTextContent('Parcial');
    expect(card).toHaveAttribute('aria-label', expect.stringContaining('saúde parcial'));
    expect(card).toHaveClass('border-amber-400/40');
  });

  it('filtra status em conjunto com a busca', async () => {
    render(<HealthchecksPage />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /Ana.*Loja Ana/ });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status do healthcheck' }), 'failed');
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar usuários' }), 'Pessoa 3');
    expect(screen.getByRole('button', { name: /Pessoa 3.*Loja 3/ })).toBeInTheDocument();
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana.*Loja Ana/ })).not.toBeInTheDocument();
  });

  it('filtra clientes sem validação', async () => {
    render(<HealthchecksPage />);
    await screen.findByRole('button', { name: /Ana.*Loja Ana/ });
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: 'Status do healthcheck' }), 'unvalidated');
    expect(screen.getByText('9 resultados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana.*Loja Ana/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pessoa 4.*Loja 4/ })).toBeInTheDocument();
  });

  it('seleciona Saudável e Parcial e permite voltar a todos os status', async () => {
    render(<HealthchecksPage />);
    const user = userEvent.setup();
    const status = await screen.findByRole('combobox', { name: 'Status do healthcheck' });

    await user.selectOptions(status, 'success');
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pessoa 2.*Loja 2/ })).toHaveTextContent('Saudável');
    expect(screen.queryByRole('button', { name: /Ana.*Loja Ana/ })).not.toBeInTheDocument();

    await user.selectOptions(status, 'partial');
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana.*Loja Ana/ })).toHaveTextContent('Parcial');
    expect(screen.queryByRole('button', { name: /Pessoa 2.*Loja 2/ })).not.toBeInTheDocument();

    await user.selectOptions(status, 'all');
    expect(screen.getByText('12 resultados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana.*Loja Ana/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pessoa 2.*Loja 2/ })).toBeInTheDocument();
  });

  it('reinicia na primeira página ao selecionar um status', async () => {
    const manyRows = Array.from({ length: 20 }, (_, index) => ({
      ...userRow,
      userId: `pagination-${index + 1}`,
      name: `Cliente ${index + 1}`,
      tenantId: `tenant-${index + 1}`,
      tenantName: `Loja ${index + 1}`,
      status: index < 10 ? 'failed' : 'success',
    }));
    mockGet.mockImplementation((url: string) => url === '/admin/healthchecks/users'
      ? Promise.resolve({ data: { data: manyRows } })
      : Promise.reject(new Error(`Unexpected URL ${url}`)));
    render(<HealthchecksPage />);
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /Cliente 1.*Loja 1/ });
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cliente 10.*Loja 10/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status do healthcheck' }), 'failed');

    expect(screen.getByText('10 resultados')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cliente 1.*Loja 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cliente 10.*Loja 10/ })).not.toBeInTheDocument();
  });

  it('mostra vazio para combinação sem correspondência', async () => {
    render(<HealthchecksPage />);
    await screen.findByRole('button', { name: /Ana.*Loja Ana/ });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status do healthcheck' }), 'failed');
    await user.type(screen.getByRole('searchbox', { name: 'Pesquisar usuários' }), 'desconhecido');
    expect(screen.getByText('Nenhum usuário corresponde aos filtros.')).toBeInTheDocument();
  });

  it('mostra erro seguro se a lista falha', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    render(<HealthchecksPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os usuários e integrações Meta.');
  });
});
