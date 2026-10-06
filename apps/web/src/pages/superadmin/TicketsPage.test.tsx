/*
Funcionalidade: tela de chamados do painel administrativo

  Cenário: abrir ticket com dados válidos
    Dado que o superadmin abre o modal e preenche o formulário
    Quando envia o ticket
    Então vê a confirmação e o link da tarefa no ClickUp dentro do modal

  Cenário: fechar o modal de novo chamado
    Dado que o modal de novo chamado está aberto
    Quando pressiona Esc
    Então o modal fecha

  Cenário: impedir e-mail inválido
    Dado que o e-mail não é válido
    Quando tenta enviar o formulário
    Então a API não é chamada e o resumo de erros aparece no modal

  Cenário: manter o preenchimento após erro do serviço
    Dado que o ClickUp está indisponível
    Quando o superadmin envia o ticket
    Então vê uma mensagem segura e seus dados continuam no formulário

  Cenário: lista única com abas Abertos e Resolvidos
    Dado que há chamados em ambas as filas
    Quando a página é renderizada
    Então a aba Abertos é a ativa e a contagem de cada fila aparece na aba

  Cenário: trocar de aba
    Dado que o superadmin está na aba Abertos
    Quando clica na aba Resolvidos
    Então o painel mostra os chamados resolvidos e não os abertos

  Cenário: paginar a lista em páginas de 10
    Dado que a fila ativa tem 12 chamados
    Quando a página é renderizada
    Então só os 10 primeiros aparecem, com controle "Página 1 de 2"

  Cenário: navegar entre páginas da lista
    Dado que o superadmin está na página 1 de 2
    Quando avança de página
    Então vê os 2 chamados restantes e a navegação anterior volta habilitada

  Cenário: seção de níveis recolhível
    Dado que a ajuda de níveis ocupa espaço na página
    Quando a página é renderizada
    Então a seção fica recolhida e expande ao clicar no título

  Cenário: exibir status e prioridade traduzidos
    Dado que um ticket aberto tem status "em progresso" e prioridade "high"
    Quando a lista é renderizada
    Então os chips mostram "Em progresso" e "Alta" com texto visível

  Cenário: exibir idade relativa do ticket
    Dado que um ticket foi criado há 3 dias
    Quando a lista é renderizada
    Então a idade "há 3 dias" aparece no card

  Cenário: contar caracteres da descrição
    Dado que a descrição aceita no máximo 5000 caracteres
    Quando o superadmin digita no campo
    Então um contador mostra o total digitado

  Cenário: estado vazio com orientação
    Dado que não há chamados na fila ativa
    Quando a página é renderizada
    Então a lista mostra uma orientação clara e sem controles de página
*/
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketsPage } from './TicketsPage';

const mockPost = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: mockGet } }));

const NOW = new Date('2026-10-06T12:00:00-03:00');

type MockTicket = { id: string; name: string; status: string; priority: string; url: string; createdAt: string };

function ticket(id: string, name: string, over: Partial<MockTicket> = {}): MockTicket {
  return { id, name, status: 'em progresso', priority: 'normal', url: `https://app.clickup.com/t/${id}`, createdAt: '2026-10-03T12:00:00.000Z', ...over };
}

function mockTicketsData(ticketLists?: { open: MockTicket[]; resolved: MockTicket[] }) {
  const lists = ticketLists ?? {
    open: [ticket('open-1', '[N2] Publicação falhou', { priority: 'high' })],
    resolved: [ticket('done-1', '[N1] Dúvida resolvida', { status: 'concluído' })],
  };
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/tickets') return Promise.resolve({ data: { data: lists, partial_failures: [] } });
    if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [{ id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br' }] } });
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
  return lists;
}

const setupUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

async function openModalAndFill(user = setupUser()) {
  await user.click(await screen.findByRole('button', { name: 'Abrir chamado' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText('E-mail do usuário'), 'cliente@empresa.com');
  await user.type(within(dialog).getByLabelText('Assunto'), 'Erro ao publicar campanha');
  await user.type(within(dialog).getByLabelText('Descrição'), 'A publicação falha depois de confirmar os dados.');
  await user.selectOptions(within(dialog).getByLabelText('Prioridade'), 'high');
  await user.selectOptions(within(dialog).getByLabelText('Nível'), 'N2');
  await within(dialog).findByRole('option', { name: 'Kaio Araújo' });
  await user.selectOptions(within(dialog).getByLabelText('Responsável'), '101281834');
  return dialog;
}

describe('TicketsPage', () => {
  beforeEach(() => {
    mockPost.mockReset(); mockGet.mockReset(); mockTicketsData();
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  });

  it('abre o formulário em modal e envia ticket válido com link do ClickUp', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', {
      email: 'cliente@empresa.com', subject: 'Erro ao publicar campanha',
      description: 'A publicação falha depois de confirmar os dados.', priority: 'high', level: 'N2', assigneeId: 101281834,
    }));
    expect(await within(dialog).findByRole('link', { name: 'Abrir ticket no ClickUp' })).toHaveAttribute('href', 'https://app.clickup.com/t/task-123');
  });

  it('fecha o modal de novo chamado com Esc', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    await openModalAndFill(user);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('não envia quando o e-mail é inválido e resume erros no modal', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.clear(within(dialog).getByLabelText('E-mail do usuário'));
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    const summary = await within(dialog).findByRole('alert');
    expect(within(summary).getByRole('link', { name: /e-mail do usuário/i })).toHaveAttribute('href', '#ticket-email');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('mantém os campos e mostra mensagem segura quando a API falha', async () => {
    mockPost.mockResolvedValue({ data: { error: { message: 'Não foi possível abrir o ticket agora. Tente novamente.' } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    expect(await within(dialog).findByText('Não foi possível abrir o ticket agora. Tente novamente.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Assunto')).toHaveValue('Erro ao publicar campanha');
    expect(within(dialog).getByLabelText('Nível')).toHaveValue('N2');
  });

  it('mostra uma lista única com abas Abertos e Resolvidos e contagens', async () => {
    render(<TicketsPage />);

    const tablist = await screen.findByRole('tablist');
    const openTab = within(tablist).getByRole('tab', { name: /abertos/i });
    expect(openTab).toHaveAttribute('aria-selected', 'true');
    const resolvedTab = within(tablist).getByRole('tab', { name: /resolvidos/i });
    expect(resolvedTab).toHaveAttribute('aria-selected', 'false');
    expect(within(openTab).getByText('1')).toBeInTheDocument();
    expect(within(resolvedTab).getByText('1')).toBeInTheDocument();

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('[N2] Publicação falhou')).toBeInTheDocument();
    expect(within(panel).queryByText('[N1] Dúvida resolvida')).not.toBeInTheDocument();
  });

  it('troca de aba ao clicar em Resolvidos', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    await screen.findByRole('tablist');

    await user.click(screen.getByRole('tab', { name: /resolvidos/i }));

    const panel = screen.getByRole('tabpanel');
    expect(await within(panel).findByText('[N1] Dúvida resolvida')).toBeInTheDocument();
    expect(within(panel).queryByText('[N2] Publicação falhou')).not.toBeInTheDocument();
  });

  it('pagina a lista em páginas de 10 com controles e contador', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ticket(`open-${i + 1}`, `[N2] Chamado ${i + 1}`));
    mockTicketsData({ open: many, resolved: [] });
    render(<TicketsPage />);

    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(10);
    expect(within(panel).getByText('Página 1 de 2')).toBeInTheDocument();

    const next = within(panel).getByRole('button', { name: /próxima página/i });
    const prev = within(panel).getByRole('button', { name: /página anterior/i });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    const user = setupUser();
    await user.click(next);
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
    expect(within(panel).getByText('Página 2 de 2')).toBeInTheDocument();
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();
  });

  it('seção de níveis fica recolhida e expande ao clicar', async () => {
    render(<TicketsPage />);
    await screen.findByRole('tablist');

    const details = screen.getByText('Como escolher o nível').closest('details') as HTMLElement;
    expect(details).not.toBeNull();
    expect(details).toHaveProperty('open', false);

    const user = setupUser();
    await user.click(within(details).getByText('Como escolher o nível'));
    expect(details).toHaveProperty('open', true);
    expect(screen.getByText('N1 — Orientação simples')).toBeVisible();
    expect(screen.getByText('N4 — Crítico')).toBeVisible();
  });

  it('exibe status e prioridade traduzidos com texto visível nos chips', async () => {
    render(<TicketsPage />);
    const panel = await screen.findByRole('tabpanel');

    expect(within(panel).getByText('Em progresso')).toBeInTheDocument();
    expect(within(panel).getByText('Alta')).toBeInTheDocument();
  });

  it('exibe a idade relativa do ticket (há 3 dias)', async () => {
    render(<TicketsPage />);
    await screen.findByRole('tabpanel');

    expect(screen.getByText('há 3 dias')).toBeInTheDocument();
  });

  it('conta caracteres da descrição enquanto digita', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Abrir chamado' }));
    const dialog = await screen.findByRole('dialog');
    const description = 'Descrição de teste com trinta caracteres';
    await user.type(within(dialog).getByLabelText('Descrição'), description);

    expect(await within(dialog).findByText(`${description.length}/5000`)).toBeInTheDocument();
  });

  it('mostra orientação no estado vazio da fila ativa, sem paginação', async () => {
    mockTicketsData({ open: [], resolved: [] });
    render(<TicketsPage />);

    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getByText('Nenhum chamado em aberto no momento.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /próxima página/i })).not.toBeInTheDocument();
  });
});
