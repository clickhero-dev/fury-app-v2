/*
Funcionalidade: tela de chamados do painel administrativo

  Cenário: abrir ticket com dados válidos
    Dado que o superadmin preenche o formulário
    Quando envia o ticket
    Então vê a confirmação e o link da tarefa no ClickUp

  Cenário: impedir e-mail inválido
    Dado que o e-mail não é válido
    Quando tenta enviar o formulário
    Então a API não é chamada e o erro é informado

  Cenário: manter o preenchimento após erro do serviço
    Dado que o ClickUp está indisponível
    Quando o superadmin envia o ticket
    Então vê uma mensagem segura e seus dados continuam no formulário

  Cenário: resumir erros de validação num local focável
    Dado que o formulário tem campos inválidos
    Quando o superadmin tenta enviar
    Então um resumo com links para cada campo inválido aparece no topo do form

  Cenário: indicar carregamento das listas
    Dado que a lista de chamados ainda não carregou
    Quando a página é aberta
    Então um status de carregamento é anunciado até os dados chegarem

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
    Dado que não há chamados numa lista
    Quando a página é renderizada
    Então a lista mostra uma orientação clara em vez de só texto cinza

  Cenário: botão de envio com contraste AA
    Dado que o botão de abrir ticket tem texto branco
    Quando a página é renderizada
    Então o fundo usa a variante escura do Petróleo (#17708A)
*/
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketsPage } from './TicketsPage';

const mockPost = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: mockGet } }));

const NOW = new Date('2026-10-06T12:00:00-03:00');

function mockTicketsData() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/tickets') return Promise.resolve({ data: { data: {
      open: [{ id: 'open-1', name: '[N2] Publicação falhou', status: 'em progresso', priority: 'high', url: 'https://app.clickup.com/t/open-1', createdAt: '2026-10-03T12:00:00.000Z' }],
      resolved: [{ id: 'done-1', name: '[N1] Dúvida resolvida', status: 'concluído', priority: 'normal', url: 'https://app.clickup.com/t/done-1', createdAt: '2026-10-05T00:00:00.000Z' }],
    }, partial_failures: [] } });
    if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [{ id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br' }] } });
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
}

async function fillValidForm(user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })) {
  await user.type(screen.getByLabelText('E-mail do usuário'), 'cliente@empresa.com');
  await user.type(screen.getByLabelText('Assunto'), 'Erro ao publicar campanha');
  await user.type(screen.getByLabelText('Descrição'), 'A publicação falha depois de confirmar os dados.');
  await user.selectOptions(screen.getByLabelText('Prioridade'), 'high');
  await user.selectOptions(screen.getByLabelText('Nível'), 'N2');
  await screen.findByRole('option', { name: 'Kaio Araújo' });
  await user.selectOptions(screen.getByLabelText('Responsável'), '101281834');
  return user;
}

describe('TicketsPage', () => {
  beforeEach(() => {
    mockPost.mockReset(); mockGet.mockReset(); mockTicketsData();
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  });

  it('envia ticket válido e exibe link do ClickUp', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    const user = await fillValidForm();

    await user.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', {
      email: 'cliente@empresa.com', subject: 'Erro ao publicar campanha',
      description: 'A publicação falha depois de confirmar os dados.', priority: 'high', level: 'N2', assigneeId: 101281834,
    }));
    expect(await screen.findByRole('link', { name: 'Abrir ticket no ClickUp' })).toHaveAttribute('href', 'https://app.clickup.com/t/task-123');
  });

  it('não envia quando o e-mail é inválido', async () => {
    render(<TicketsPage />);
    fireEvent.change(screen.getByLabelText('E-mail do usuário'), { target: { value: 'email-inválido' } });
    fireEvent.change(screen.getByLabelText('Assunto'), { target: { value: 'Assunto válido' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição detalhada para abrir o chamado.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('mantém os campos e mostra mensagem segura quando a API falha', async () => {
    mockPost.mockResolvedValue({
      data: { error: { message: 'Não foi possível abrir o ticket agora. Tente novamente.' } },
    });
    render(<TicketsPage />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    expect(await screen.findByText('Não foi possível abrir o ticket agora. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Assunto')).toHaveValue('Erro ao publicar campanha');
    expect(screen.getByLabelText('Nível')).toHaveValue('N2');
  });

  it('mostra abertos, resolvidos, ajuda de níveis e links ClickUp', async () => {
    render(<TicketsPage />);

    expect(await screen.findByText('Abertos (1)')).toBeInTheDocument();
    expect(screen.getByText('Resolvidos (1)')).toBeInTheDocument();
    expect(screen.getByText('[N2] Publicação falhou')).toBeInTheDocument();
    expect(screen.getByText('[N1] Dúvida resolvida')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver no ClickUp: [N2] Publicação falhou' })).toHaveAttribute('href', 'https://app.clickup.com/t/open-1');
    expect(screen.getByText('N1 — Orientação simples')).toBeInTheDocument();
    expect(screen.getByText('N4 — Crítico')).toBeInTheDocument();
  });

  it('resume erros de validação com links focáveis para os campos', async () => {
    render(<TicketsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveAttribute('aria-labelledby', 'ticket-error-title');
    const heading = within(summary).getByText('Revise os campos destacados');
    expect(heading).toBeInTheDocument();
    const emailLink = within(summary).getByRole('link', { name: /e-mail do usuário/i });
    expect(emailLink).toHaveAttribute('href', '#ticket-email');
    expect(within(summary).getByRole('link', { name: /assunto/i })).toHaveAttribute('href', '#ticket-subject');
    expect(within(summary).getByRole('link', { name: /descrição/i })).toHaveAttribute('href', '#ticket-description');
  });

  it('anuncia carregamento das listas antes dos dados chegarem', async () => {
    let resolveList: (value: unknown) => void = () => {};
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/tickets') return new Promise((resolve) => { resolveList = resolve; });
      if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    render(<TicketsPage />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Carregando chamados…');

    resolveList({ data: { data: { open: [], resolved: [] } } });
    await waitFor(() => expect(screen.queryByText('Carregando chamados…')).not.toBeInTheDocument());
  });

  it('exibe status e prioridade traduzidos com texto visível nos chips', async () => {
    render(<TicketsPage />);

    await screen.findByText('Abertos (1)');
    const openSection = screen.getByText('Abertos (1)').closest('section') as HTMLElement;
    expect(within(openSection).getByText('Em progresso')).toBeInTheDocument();
    expect(within(openSection).getByText('Alta')).toBeInTheDocument();

    const resolvedSection = screen.getByText('Resolvidos (1)').closest('section') as HTMLElement;
    expect(within(resolvedSection).getByText('Concluído')).toBeInTheDocument();
    expect(within(resolvedSection).getByText('Normal')).toBeInTheDocument();
  });

  it('exibe a idade relativa do ticket (há 3 dias)', async () => {
    render(<TicketsPage />);

    await screen.findByText('Abertos (1)');
    expect(screen.getByText('há 3 dias')).toBeInTheDocument();
  });

  it('conta caracteres da descrição enquanto digita', async () => {
    render(<TicketsPage />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const description = 'Descrição de teste com trinta caracteres';
    await user.type(screen.getByLabelText('Descrição'), description);

    expect(await screen.findByText(`${description.length}/5000`)).toBeInTheDocument();
  });

  it('mostra orientação no estado vazio da lista de abertos', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/tickets') return Promise.resolve({ data: { data: { open: [], resolved: [] } } });
      if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    render(<TicketsPage />);

    await waitFor(() => expect(screen.getByText('Abertos (0)')).toBeInTheDocument());
    const openSection = screen.getByText('Abertos (0)').closest('section') as HTMLElement;
    expect(within(openSection).getByText('Nenhum chamado em aberto no momento.')).toBeInTheDocument();
  });

  it('usa a variante AA (#17708A) no botão de envio', async () => {
    render(<TicketsPage />);

    const button = screen.getByRole('button', { name: 'Abrir ticket' });
    expect(button.className).toContain('bg-[#17708A]');
  });
});
