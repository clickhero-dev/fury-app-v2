/*
Funcionalidade: tela de chamados do painel administrativo

  Cenário: abrir ticket com dados válidos
    Dado que o superadmin abre o modal e preenche o formulário
    Quando envia o ticket
    Então o modal fecha e vê a confirmação em um snack global

  Cenário: fechar o modal de novo chamado
    Dado que o modal de novo chamado está aberto
    Quando pressiona Esc
    Então o modal fecha

  Cenário: impedir e-mail inválido
    Dado que o e-mail não é válido
    Quando tenta enviar o formulário
    Então a API não é chamada e o resumo de erros aparece no modal

  Cenário: classificação opcional
    Dado que o formulário exibe escopo e área do playbook
    Quando o superadmin envia o chamado
    Então a API recebe os demais campos sem etiquetas

  Cenário: informar erro do serviço após fechar o modal
    Dado que o ClickUp está indisponível
    Quando o superadmin envia o ticket
    Então o modal fecha e vê uma mensagem segura no snack

  Cenário: anexar evidências ao ticket
    Dado que o superadmin seleciona uma imagem ou vídeo
    Quando envia o chamado
    Então a tela envia multipart com os anexos selecionados

  Cenário: falhar ao anexar evidências após criar o ticket
    Dado que o ClickUp criou a tarefa mas não aceitou todos os anexos
    Quando a API retorna a URL segura da tarefa
    Então o modal fecha e o snack oferece acesso à tarefa criada

  Cenário: lista única com abas Abertos e Resolvidos
    Dado que há chamados em ambas as filas
    Quando a página é renderizada
    Então a aba Abertos é a ativa e a contagem de cada fila aparece na aba

  Cenário: trocar de aba
    Dado que o superadmin está na aba Abertos
    Quando clica na aba Resolvidos
    Então o painel mostra os chamados resolvidos e não os abertos

  Cenário: paginar a lista em páginas de 10
    Dado que a fila ativa tem 11 chamados
    Quando a página é renderizada
    Então só os 10 primeiros aparecem, com controle "Página 1 de 2"

  Cenário: navegar entre páginas da lista
    Dado que o superadmin está na página 1 de 2
    Quando avança de página
    Então vê o chamado restante e a navegação anterior volta habilitada

  Cenário: exibir o rodapé em uma página única
    Dado que a fila ativa tem até 6 chamados
    Quando a página é renderizada
    Então vê o controle "Página 1 de 1" com a navegação desabilitada

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

  Cenário: buscar assunto sem diferenciar caixa e combinar com status
    Dado que há chamados com assuntos e status diferentes nas duas filas
    Quando pesquiso parte do assunto e seleciono um status
    Então só os chamados que correspondem aos dois filtros aparecem

  Cenário: opções dinâmicas e chamado sem status
    Dado que os status variam entre as filas e há um chamado sem status
    Quando abro o filtro de status
    Então vejo cada status uma vez e uma opção “Sem status”

  Cenário: limpar filtros e reiniciar paginação
    Dado que estou em outra página com filtros ativos
    Quando altero a busca ou limpo os filtros
    Então volto à primeira página e os contadores refletem os resultados

  Cenário: manter filtros ao trocar de fila e atualizar
    Dado que há filtros ativos
    Quando troco de fila ou atualizo os chamados
    Então os filtros continuam aplicados aos dados carregados

  Cenário: preservar status selecionado que desapareceu após atualização
    Dado que o status selecionado não está mais nos chamados atualizados
    Quando a tela termina de atualizar
    Então a seleção permanece identificável e a contagem filtrada fica zero
*/
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketsPage } from './TicketsPage';

const mockPost = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
const mockShowSnack = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: mockGet } }));
vi.mock('@/lib/snack', () => ({ showSnack: mockShowSnack }));

const NOW = new Date('2026-10-06T12:00:00-03:00');

type MockTicket = { id: string; name: string; status: string; priority: string; url: string; createdAt: string; labels?: Array<'app' | 'ux' | 'infra' | 'api' | 'dados' | 'integracoes' | 'seguranca' | 'meta' | 'sincronizacao-dados' | 'dados-usuario' | 'google'> };

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
    mockPost.mockReset(); mockGet.mockReset(); mockShowSnack.mockReset(); mockTicketsData();
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  });

  it('fecha o modal e mostra snack de sucesso ao enviar ticket válido', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', {
      email: 'cliente@empresa.com', subject: 'Erro ao publicar campanha',
      description: 'A publicação falha depois de confirmar os dados.', priority: 'high', level: 'N2', assigneeId: 101281834, labels: [],
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockShowSnack).toHaveBeenCalledWith('Ticket aberto com sucesso.', 'success');
  });

  it('envia os anexos selecionados como multipart', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    const file = new File(['imagem'], 'erro.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Anexos (imagens ou vídeos)'), file);

    expect(within(dialog).getByText('erro.png')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', expect.any(FormData)));
    const formData = mockPost.mock.calls[0][1] as FormData;
    expect(formData.get('attachments')).toMatchObject({ name: 'erro.png', type: 'image/png' });
    expect(formData.get('labels')).toBeNull();
  });

  it('envia N5 como solicitação de feature e explica o nível na ajuda', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'feature-123', clickupTaskUrl: 'https://app.clickup.com/t/feature-123' } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.selectOptions(within(dialog).getByLabelText('Nível'), 'N5');
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', expect.objectContaining({ level: 'N5' })));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const details = screen.getByText('Como escolher o nível').closest('details') as HTMLElement;
    await user.click(within(details).getByText('Como escolher o nível'));
    expect(screen.getByText('N5 — Solicitação de feature')).toBeVisible();
  });

  it('mantém escopo e área do playbook visíveis, mas permite enviar sem seleção', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);

    expect(within(dialog).getByText('Etiquetas')).toBeInTheDocument();
    expect(within(dialog).getByText('Escopo')).toBeInTheDocument();
    expect(within(dialog).getByText('Área do playbook')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Abrir ticket' })).toBeEnabled();
  });

  it('envia as etiquetas escolhidas, inclusive no multipart', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByLabelText('App'));
    await user.click(within(dialog).getByLabelText('Meta'));
    const file = new File(['imagem'], 'erro.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Anexos (imagens ou vídeos)'), file);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', expect.any(FormData)));
    expect((mockPost.mock.calls[0][1] as FormData).get('labels')).toBe('["app","meta"]');
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

  it('fecha o modal e mostra snack seguro quando a API falha', async () => {
    mockPost.mockRejectedValue({ response: { data: { error: { message: 'Não foi possível abrir o ticket agora. Tente novamente.' } } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockShowSnack).toHaveBeenCalledWith('Não foi possível abrir o ticket agora. Tente novamente.', 'error');
  });

  it('oferece a tarefa criada no snack quando um anexo falha', async () => {
    mockPost.mockRejectedValue({ response: { data: { error: {
      message: 'O ticket foi aberto, mas não foi possível anexar todos os arquivos.',
      details: { clickupTaskUrl: 'https://app.clickup.com/t/task-123' },
    } } } });
    render(<TicketsPage />);
    const user = setupUser();
    const dialog = await openModalAndFill(user);
    await user.click(within(dialog).getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockShowSnack).toHaveBeenCalledWith(
      'O ticket foi aberto, mas não foi possível anexar todos os arquivos.',
      'error',
      { label: 'Abrir tarefa', href: 'https://app.clickup.com/t/task-123' },
    );
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
    const many = Array.from({ length: 11 }, (_, i) => ticket(`open-${i + 1}`, `[N2] Chamado ${i + 1}`));
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
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1);
    expect(within(panel).getByText('Página 2 de 2')).toBeInTheDocument();
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();
  });

  it('exibe o rodapé com navegação desabilitada quando a fila cabe em uma página', async () => {
    mockTicketsData({
      open: Array.from({ length: 6 }, (_, i) => ticket(`open-${i + 1}`, `[N2] Chamado ${i + 1}`)),
      resolved: [],
    });
    render(<TicketsPage />);

    const panel = await screen.findByRole('tabpanel');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
    expect(within(panel).getByText('Página 1 de 1')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /página anterior/i })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: /próxima página/i })).toBeDisabled();
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

    expect(within(panel).getAllByText('Em progresso')).toHaveLength(2);
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

  it('filtra por assunto sem diferenciar caixa e combina status por AND', async () => {
    mockTicketsData({
      open: [ticket('a', 'Falha na Publicação', { status: 'release' }), ticket('b', 'Falha no login', { status: 'release' }), ticket('c', 'Falha na Publicação', { status: 'monitoring' })],
      resolved: [ticket('d', 'Falha na Publicação', { status: 'release' })],
    });
    render(<TicketsPage />);
    const user = setupUser();
    const search = await screen.findByRole('searchbox', { name: 'Pesquisar por assunto' });
    await user.type(search, ' PUBLICAÇÃO ');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'release');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(1);
    expect(within(panel).getByText('Falha na Publicação')).toBeInTheDocument();
    expect(within(screen.getByRole('tab', { name: /abertos/i })).getByText('1')).toBeInTheDocument();
  });

  it('deriva status das duas filas, deduplica opções e inclui chamados sem status', async () => {
    mockTicketsData({ open: [ticket('a', 'Com status', { status: 'release' }), ticket('b', 'Sem status', { status: '' })], resolved: [ticket('c', 'Resolvido', { status: 'release' })] });
    render(<TicketsPage />);
    const selector = await screen.findByRole('combobox', { name: 'Status' });
    expect(within(selector).getAllByRole('option', { name: 'Release' })).toHaveLength(1);
    expect(within(selector).getByRole('option', { name: 'Sem status' })).toBeInTheDocument();
    const user = setupUser();
    await user.selectOptions(selector, '__empty_status__');
    expect(within(screen.getByRole('tabpanel')).getAllByText('Sem status')).toHaveLength(3);
    expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('mostra estado vazio de filtro e limpa busca/status sem perder os dados', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    await user.type(await screen.findByRole('searchbox', { name: 'Pesquisar por assunto' }), 'inexistente');
    expect(await screen.findByText('Nenhum chamado encontrado para os filtros selecionados.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('[N2] Publicação falhou')).toBeInTheDocument();
  });

  it('preserva filtros ao trocar de aba e atualizar', async () => {
    render(<TicketsPage />);
    const user = setupUser();
    await user.type(await screen.findByRole('searchbox', { name: 'Pesquisar por assunto' }), 'dúvida');
    await user.click(screen.getByRole('tab', { name: /resolvidos/i }));
    expect(await screen.findByText('[N1] Dúvida resolvida')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('[N1] Dúvida resolvida')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Pesquisar por assunto' })).toHaveValue('dúvida');
  });

  it('preserva status selecionado que desaparece após atualizar e mostra zero resultados', async () => {
    let current = { open: [ticket('a', 'Ticket release', { status: 'release' })], resolved: [] as MockTicket[] };
    mockGet.mockImplementation((url: string) => {
      if (url === '/admin/tickets') return Promise.resolve({ data: { data: current, partial_failures: [] } });
      if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [] } });
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });
    render(<TicketsPage />);
    const user = setupUser();
    const selector = await screen.findByRole('combobox', { name: 'Status' });
    await user.selectOptions(selector, 'release');
    current = { open: [ticket('a', 'Ticket atualizado', { status: 'triagem' })], resolved: [] };
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('Nenhum chamado encontrado para os filtros selecionados.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('release');
    expect(within(screen.getByRole('tab', { name: /abertos/i })).getByText('0')).toBeInTheDocument();
  });
});
