// @vitest-environment jsdom
/*
Funcionalidade: conversar com a assistente
Cenário: enviar uma mensagem
Dado que existe uma conversa
Quando o usuário envia uma mensagem
Então a resposta aparece progressivamente
Cenário: aprovação de ação
Dado que há uma proposta pendente
Quando o usuário confirma
Então somente essa ação é confirmada
Cenário: falha ao carregar
Dado que o serviço está indisponível
Quando o usuário abre o chat
Então recebe uma mensagem de erro
Cenário: mensagem vazia
Dado que o campo está vazio
Quando o usuário tenta enviar
Então nenhuma requisição é feita
Cenário: mensagens novas mantêm o fim da conversa visível
Dado que uma conversa tem mensagens do usuário e da Ady
Quando a conversa é aberta
Então as mensagens são identificadas pelo remetente e a rolagem alcança o fim
Cenário: a apresentação não ocupa espaço em conversas com conteúdo
Dado que existe uma conversa com mensagens
Quando o usuário abre a conversa
Então a apresentação deixa de aparecer e as mensagens permanecem visíveis
Cenário: uma conversa vazia apresenta sugestões
Dado que existe uma conversa sem mensagens nem ações
Quando o usuário abre a conversa
Então a apresentação e as sugestões ficam disponíveis
Cenário: enviar mensagem pelo teclado
Dado que uma conversa está aberta e a mensagem está preenchida
Quando o usuário pressiona Enter
Então a mensagem é enviada uma vez
Cenário: inserir quebra de linha sem enviar
Dado que uma conversa está aberta
Quando o usuário pressiona Shift e Enter
Então nenhuma mensagem é enviada
Cenário: resposta formatada pela assistente
Dado que há uma resposta com texto em negrito e uma lista
Quando a conversa é aberta
Então a formatação aparece sem permitir HTML arbitrário
Cenário: abrir e fechar histórico
Dado que o histórico está recolhido
Quando o usuário solicita as conversas
Então o controle informa que o histórico foi aberto
Cenário: renomear conversa
Dado que uma conversa está selecionada
Quando o usuário salva outro nome
Então o nome confirmado pelo servidor aparece no histórico
Cenário: falha ao renomear
Dado que não é possível salvar o novo nome
Quando o usuário confirma a edição
Então o nome anterior permanece visível e uma mensagem explica a falha
Cenário: buscar conversa pelo nome
Dado que existem conversas com assuntos diferentes
Quando o usuário busca parte de um título
Então apenas as conversas correspondentes aparecem
Cenário: título automático da conversa
Dado que a assistente finaliza uma resposta
Quando o serviço informa o título gerado
Então o histórico mostra o título da conversa correta
Cenário: manter a conversa no fim quando o carregamento dos planos falha
Dado que o usuário está acompanhando as mensagens mais recentes
Quando o alerta de falha dos planos aparece
Então a rolagem continua no fim da conversa
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPage } from './ChatPage';
import { refreshSession } from '../../lib/session-refresh';
vi.mock('../../lib/session-refresh', () => ({refreshSession: vi.fn()}));
const chatPlanState = vi.hoisted(() => ({
  plans: [] as never[],
  errors: {} as Record<string, string>,
  error: null as string | null,
}));
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({
  plans: chatPlanState.plans, loading: false, refreshing: false, error: chatPlanState.error, errors: chatPlanState.errors, busyPlanIds: [],
  refetch: vi.fn().mockResolvedValue(undefined), onAction: vi.fn().mockResolvedValue(true),
  onEdit: vi.fn().mockResolvedValue(true), onCompleteTask: vi.fn().mockResolvedValue(true),
})}));

beforeEach(() => { chatPlanState.error = null; sessionStorage.clear(); localStorage.setItem('token', 'token'); vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString() }); });
async function openConversationOptions() {
  const trigger = await screen.findByRole('button', {name:'Opções da conversa'});
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.keyDown(trigger, {key:'ArrowDown'});
  return screen.findByRole('menu');
}
describe('Assistente', () => {
  /* Funcionalidade: voltar à conversa após criar pelo histórico
   * Cenário: criar conversa no painel móvel
   * Dado o histórico modal aberto, quando crio uma conversa,
   * então o painel fecha após o sucesso e o campo de mensagem fica disponível.
   */
  it('fecha o histórico após criar uma conversa pelo painel', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('{"id":"1","title":"Nova conversa"}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    fireEvent.click(screen.getByRole('button', {name:'Mostrar conversas'}));
    const dialog = await screen.findByRole('dialog', {name:'Conversas'});
    fireEvent.click(within(dialog).getByRole('button', {name:'Nova conversa'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog', {name:'Conversas'})).toBeNull());
    expect(screen.getByLabelText('Mensagem')).toBeEnabled();
    expect(screen.getByRole('button', {name:'Mostrar conversas'})).toHaveFocus();
  });
  /* Cenário: criação falha no painel móvel
   * Dado o histórico aberto, quando o serviço falha ao criar,
   * então permaneço no painel com um erro acessível e posso tentar novamente.
   */
  it('mostra a falha de criação dentro do histórico aberto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('{}', {status:500})));
    render(<ChatPage/>);
    fireEvent.click(screen.getByRole('button', {name:'Mostrar conversas'}));
    const dialog = await screen.findByRole('dialog', {name:'Conversas'});
    fireEvent.click(within(dialog).getByRole('button', {name:'Nova conversa'}));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Não foi possível iniciar a conversa.');
    expect(within(dialog).getByRole('button', {name:'Nova conversa'})).toBeEnabled();
  });
  /* Funcionalidade: campo de mensagem adaptável
   * Cenário: escrever várias linhas e voltar a um rascunho curto
   * Dado um campo compacto, quando digito mais linhas,
   * então cresce até 160px, rola só depois do limite e diminui ao apagar.
   */
  it('adapta a altura do composer ao conteúdo sem ultrapassar o limite', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText('Mensagem');
    Object.defineProperty(input, 'scrollHeight', {configurable:true, value:92});
    fireEvent.change(input, {target:{value:'Primeira linha\nSegunda linha\nTerceira linha'}});
    expect(input.style.height).toBe('92px');
    expect(input).toHaveAttribute('placeholder', 'Digite uma mensagem…');
    expect(input.style.overflowY).toBe('hidden');
    Object.defineProperty(input, 'scrollHeight', {configurable:true, value:360});
    fireEvent.change(input, {target:{value:'Linha\n'.repeat(15)}});
    expect(input.style.height).toBe('160px');
    expect(input.style.overflowY).toBe('auto');
    Object.defineProperty(input, 'scrollHeight', {configurable:true, value:44});
    fireEvent.change(input, {target:{value:''}});
    expect(input.style.height).toBe('44px');
    expect(input.style.overflowY).toBe('hidden');
    expect(screen.getByRole('button', {name:'Enviar mensagem'})).toBeDisabled();
  });
  /* Funcionalidade: mensageiro com identidade Ady
   * Cenário: reconhecer a assistente e iniciar sem hero
   * Dado o chat vazio, quando entro na página,
   * então vejo a marca, a identificação de IA e uma orientação curta com sugestões.
   */
  it('identifica a Ady como IA e oferece orientação inicial compacta', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const header = document.querySelector('.ady-chat-header')!;
    expect(within(header as HTMLElement).getByText('Assistente de IA')).toBeInTheDocument();
    expect(header.querySelector('.ady-chat-avatar svg[aria-label="ady"]')).not.toBeNull();
    expect(screen.getByText('Como posso ajudar?')).toBeInTheDocument();
    expect(screen.queryByText(/Ideias melhores|DA IDEIA À CRIAÇÃO/)).toBeNull();
    expect(screen.getByRole('button', {name:'Criar imagens'})).toBeEnabled();
    expect(screen.getByRole('button', {name:'Criar vídeos'})).toBeEnabled();
    expect(screen.getByRole('button', {name:'Anexar arquivos'})).toBeEnabled();
    expect(screen.getByRole('button', {name:'Gravar mensagem'})).toBeEnabled();
  });
  /* Cenário: assuntos longos no histórico
   * Dado um título extenso, quando carrego o histórico,
   * então seu nome completo permanece acessível, com avatar decorativo e sem buscar prévias.
   */
  it('mantém títulos completos acessíveis em linhas com avatar sem buscar prévias', async () => {
    const title = 'podemos programar postagens organicas para o nosso mes inteiro?';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1', title}])));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    const conversation = await screen.findByRole('button', {name:title});
    expect(conversation).toHaveAttribute('title', title);
    expect(conversation).toHaveAccessibleName(title);
    expect(conversation.querySelector('.ady-chat-avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(conversation.querySelector('.ady-chat-conversation-title')).toHaveTextContent(title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  /* Funcionalidade: opções acessíveis da conversa
   * Cenário: abrir e fechar opções pelo teclado
   * Dado uma conversa aberta, quando abro o menu e pressiono Escape,
   * então encontro renomear/excluir e o foco volta ao botão de opções.
   */
  it('oferece opções da conversa pelo teclado e devolve o foco', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response('{"messages":[],"approvals":[]}')));
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    const menu = await openConversationOptions();
    expect(within(menu).getByRole('menuitem', {name:'Renomear conversa'})).toHaveFocus();
    expect(within(menu).getByRole('menuitem', {name:'Excluir conversa'})).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', {name:'Excluir conversa'})).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('button', {name:'Opções da conversa'})).toHaveFocus();
  });
  /* Cenário: cancelar renomeação e validar nome vazio
   * Dado o diálogo de renomeação, quando apago o nome e pressiono Escape,
   * então não salvo um nome vazio, o diálogo fecha e o foco volta ao menu.
   */
  it('cancela renomeação por Escape sem salvar um nome vazio', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response('{"messages":[],"approvals":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    fireEvent.click(within(await openConversationOptions()).getByRole('menuitem', {name:'Renomear conversa'}));
    fireEvent.change(await screen.findByLabelText('Nome da conversa'), {target:{value:'   '}});
    expect(screen.getByRole('button', {name:'Salvar nome'})).toBeDisabled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', {name:'Opções da conversa'})).toHaveFocus();
    expect(screen.getByRole('button', {name:'Projeto'})).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  /* Cenário: excluir a conversa pelo menu
   * Dado uma conversa aberta, quando escolho excluir,
   * então só excluo após confirmação e uma falha preserva a conversa com feedback.
   */
  it.each([
    {confirmation:false, status:200, result:'cancelada'},
    {confirmation:true, status:200, result:'concluída'},
    {confirmation:true, status:500, result:'falha'},
  ])('mantém confirmação e tratamento de erro na exclusão ($result)', async ({confirmation, status}) => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmation);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response('{"messages":[],"approvals":[]}')).mockResolvedValueOnce(new Response('{}', {status}));
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<ChatPage/>);
      fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
      fireEvent.click(within(await openConversationOptions()).getByRole('menuitem', {name:'Excluir conversa'}));
      expect(confirm).toHaveBeenCalledWith('Excluir esta conversa?');
      if (!confirmation) {
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('button', {name:'Projeto'})).toBeInTheDocument();
      } else {
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(fetchMock.mock.calls[2][0]).toContain('/conversations/1');
        expect(fetchMock.mock.calls[2][1]).toMatchObject({method:'DELETE'});
        if (status === 200) {
          await waitFor(() => expect(screen.queryByRole('button', {name:'Projeto'})).toBeNull());
          expect(sessionStorage.getItem('ady-chat-current')).toBeNull();
          expect(screen.getByLabelText('Mensagem')).toBeEnabled();
        } else {
          expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir a conversa.');
          expect(screen.getByRole('button', {name:'Projeto'})).toBeInTheDocument();
        }
      }
    } finally { confirm.mockRestore(); }
  });
  /* Funcionalidade: contexto real das mensagens
   * Cenário: horário e mudança de dia
   * Dado mensagens persistidas em dois dias, quando abro a conversa,
   * então vejo o horário de cada mensagem e apenas um separador por dia.
   */
  it('apresenta horários persistidos e agrupa mensagens por data', async () => {
    const first = new Date(2026, 10, 9, 9, 5).toISOString();
    const second = new Date(2026, 10, 9, 9, 6).toISOString();
    const third = new Date(2026, 10, 10, 10, 15).toISOString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response(JSON.stringify({messages:[
      {id:'u', role:'user', content:'Minha ideia', created_at:first},
      {id:'a', role:'assistant', content:'Vamos criar', created_at:second},
      {id:'b', role:'assistant', content:'Outra ideia', created_at:third},
    ], approvals:[]}))));
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    const message = (await screen.findByText('Minha ideia')).closest('article')!;
    expect(message.querySelector('time')).toHaveAttribute('dateTime', first);
    expect(message.querySelector('time')).toHaveTextContent('09:05');
    expect(screen.getByText('Vamos criar').closest('article')?.querySelector('time')).toHaveTextContent('09:06');
    expect(screen.getByText('Outra ideia').closest('article')?.querySelector('time')).toHaveTextContent('10:15');
    expect(screen.getAllByText('9 de novembro de 2026')).toHaveLength(1);
    expect(screen.getAllByText('10 de novembro de 2026')).toHaveLength(1);
  });
  /* Cenário: confirmação persistida durante streaming
   * Dado uma mensagem otimista sem data, quando chegam done e title,
   * então só a resposta recebe o horário do servidor e o título segue atualizado.
   */
  it('usa created_at do done sem inventar horário da mensagem otimista', async () => {
    const timestamp = new Date(2026, 10, 9, 14, 23).toISOString();
    const stream = new ReadableStream({start(c) {
      c.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({message:{content:'Resposta persistida',created_at:timestamp}})}\n\nevent: title\ndata: {"id":"1","title":"Ideia salva"}\n\n`)); c.close();
    }});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response('{"id":"1","title":"Nova conversa"}')).mockResolvedValueOnce(new Response(stream)));
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Minha ideia'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    const reply = (await screen.findByText('Resposta persistida')).closest('article')!;
    expect(reply.querySelector('time')).toHaveAttribute('dateTime', timestamp);
    expect(reply.querySelector('time')).toHaveTextContent('14:23');
    expect(screen.getByText('Minha ideia').closest('article')?.querySelector('time')).toBeNull();
    expect(screen.getByRole('button', {name:'Ideia salva'})).toBeInTheDocument();
  });
  /* Cenário: metadados ausentes ou inválidos
   * Dado respostas antigas ou com data inválida, quando abro a conversa,
   * então o conteúdo continua disponível sem horário nem separador inventado.
   */
  it.each([undefined, null, '', 'não é uma data', '2026-99-99T12:00:00Z', '2026-02-30T12:00:00Z', '2026-11-09', 123, true])('omite metadados inválidos (%s)', async created_at => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Sem horário',created_at}],approvals:[]}))));
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(await screen.findByText('Sem horário')).toBeInTheDocument();
    expect(document.querySelector('.ady-chat-messages time')).toBeNull();
    expect(document.querySelector('.ady-chat-date')).toBeNull();
    expect(screen.queryByText(/Invalid Date|online|visto por último|lida/i)).toBeNull();
  });
  /* Funcionalidade: começar sem etapas extras
   * Cenário: primeira mensagem cria uma conversa
   * Dado que não escolhi uma conversa, quando envio minha ideia,
   * então uma conversa é criada e a resposta aparece sem perder o título automático.
   */
  it('cria a conversa automaticamente no primeiro envio', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"content":"Vamos criar!"}}\n\nevent: title\ndata: {"id":"1","title":"Minha campanha"}\n\n')); c.close(); }});
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Nova conversa'}))).mockResolvedValueOnce(new Response(stream));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Mensagem')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Minha ideia'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    expect(await screen.findByText('Vamos criar!')).toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Minha campanha'})).toBeInTheDocument();
    expect(fetchMock.mock.calls[2][0]).toContain('/conversations/1/messages');
  });
  /* Cenário: criação lenta ou indisponível
   * Dado um rascunho, quando envio duas vezes durante a criação,
   * então apenas uma conversa é solicitada e uma falha preserva o texto.
   */
  it('bloqueia envio duplicado durante criação e preserva rascunho na falha', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]')).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Minha ideia'}});
    const form = screen.getByLabelText('Mensagem').closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => finish(new Response('{}', {status:500})));
    expect(await screen.findByText('Não foi possível iniciar a conversa.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Minha ideia');
    expect(screen.getByRole('button', {name:'Enviar mensagem'})).toBeEnabled();
  });
  /* Cenário: sugestão inicial
   * Dado que acabei de abrir o chat, quando escolho Criar imagem,
   * então o campo recebe a sugestão e o foco sem enviar nada.
   */
  it('preenche e foca a sugestão antes de iniciar conversa', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', {name:'Criar imagens'}));
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Quero criar uma imagem');
    expect(screen.getByLabelText('Mensagem')).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  /* Cenário: histórico modal acessível
   * Dado o histórico recolhido, quando abro e pressiono Escape,
   * então o diálogo fecha e devolve o foco ao controle de abertura.
   */
  it('fecha histórico com Escape e devolve foco', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[]')));
    render(<ChatPage/>);
    const trigger = screen.getByRole('button', {name:'Mostrar conversas'});
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', {name:'Conversas'})).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, {key:'Escape'});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  /* Cenário: ler mensagens antigas durante streaming
   * Dado uma resposta em andamento, quando volto às mensagens antigas,
   * então novos tokens não movem minha leitura e posso voltar às mensagens recentes.
   */
  it('preserva leitura antiga durante streaming e permite voltar às recentes', async () => {
    let controller!: ReadableStreamDefaultController;
    const stream = new ReadableStream({start(c) { controller = c; }});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockResolvedValueOnce(new Response('{"messages":[],"approvals":[]}')).mockResolvedValueOnce(new Response(stream)));
    render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    await screen.findByRole('button', {name:'Opções da conversa'});
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Continue'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    await screen.findByText('Ady está respondendo…');
    const list = document.querySelector('.ady-chat-messages') as HTMLElement;
    Object.defineProperties(list, {scrollHeight:{configurable:true,value:1200}, clientHeight:{configurable:true,value:300}});
    list.scrollTop = 100; fireEvent.scroll(list);
    await act(async () => { controller.enqueue(new TextEncoder().encode('event: token\ndata: {"content":"Texto novo"}\n\n')); });
    expect(await screen.findByText('Texto novo')).toBeInTheDocument();
    expect(list.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', {name:'Mensagens recentes'}));
    expect(list.scrollTop).toBe(1200);
    await act(async () => { controller.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n')); controller.close(); });
  });
  /* Cenário: busca sem correspondências
   * Dado um histórico disponível, quando busco um assunto ausente,
   * então vejo uma orientação e o composer mantém sua ajuda de teclado.
   */
  it('explica busca sem resultados e apresenta orientação de escrita', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')));
    render(<ChatPage/>);
    await screen.findByRole('button', {name:'Projeto'});
    fireEvent.change(screen.getByLabelText('Buscar conversas'), {target:{value:'inexistente'}});
    expect(screen.getByText('Nenhuma conversa encontrada. Tente outro termo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveAccessibleDescription('Enter para enviar · Shift + Enter para nova linha');
    expect(screen.getByRole('heading', {name:'Ady'})).toBeInTheDocument();
  });
  /* Cenário: troca de conversa ainda carregando
   * Dado que escolhi outra conversa, quando o carregamento está pendente,
   * então não envio meu rascunho à conversa anterior e uma falha libera o campo.
   */
  it('bloqueia envio enquanto abre conversa e preserva rascunho se falhar', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]')).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Minha ideia'}});
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(screen.getByLabelText('Mensagem')).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Mensagem').closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => finish(new Response('{}', {status:500})));
    expect(await screen.findByText('Não foi possível abrir a conversa.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toBeEnabled();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Minha ideia');
  });
  /* Cenário: teclado sem envio acidental
   * Dado um campo com espaços ou uma composição IME em andamento,
   * quando pressiono Enter, então não crio conversa nem envio mensagem.
   */
  it.each([{value:'   ', isComposing:false}, {value:'日本語', isComposing:true}])('não envia espaços ou composição IME ($isComposing)', async ({value, isComposing}) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('[]'));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value}});
    fireEvent.keyDown(screen.getByLabelText('Mensagem'), {key:'Enter', code:'Enter', isComposing});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Mensagem')).toHaveValue(value);
  });
  /* Cenário: histórico lento após primeira mensagem
   * Dado que o histórico inicial ainda carrega, quando envio e recebo um título,
   * então a resposta atrasada do histórico não apaga a conversa recém-criada.
   */
  it('preserva nova conversa quando histórico inicial chega atrasado', async () => {
    let finish!: (response: Response) => void;
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"content":"Pronto"}}\n\nevent: title\ndata: {"id":"1","title":"Minha campanha"}\n\n')); c.close(); }});
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {finish = resolve;})).mockResolvedValueOnce(new Response('{"id":"1","title":"Nova conversa"}')).mockResolvedValueOnce(new Response(stream));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Minha ideia'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    await screen.findByText('Pronto');
    await act(async () => finish(new Response('[]')));
    expect(screen.getByRole('button', {name:'Minha campanha'})).toBeInTheDocument();
  });
  it('atualiza o título ao reabrir conversa após interrupção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto anterior'}]))).mockResolvedValueOnce(new Response(JSON.stringify({title:'Campanha para cafeteria',messages:[],approvals:[]}))));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto anterior'}));
    expect(await screen.findByRole('button', {name:'Campanha para cafeteria'})).toBeTruthy();
  });
  it('atualiza o histórico com o título automático recebido após a resposta', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\nevent: title\ndata: {"id":"1","title":"Campanha para cafeteria"}\n\n')); c.close(); }});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]))).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Nova conversa'}))).mockResolvedValueOnce(new Response(stream)));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Nova conversa'}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem').hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Ideias para cafeteria'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    expect(await screen.findByRole('button', {name:'Campanha para cafeteria'})).toBeTruthy();
  });
  it('filtra conversas pelo título, sem diferenciar maiúsculas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{id:'1',title:'Campanha de café'},{id:'2',title:'Vídeo de Natal'}]))));
    render(<ChatPage />);
    await screen.findByRole('button', {name:'Campanha de café'});
    fireEvent.change(screen.getByLabelText('Buscar conversas'), {target:{value:'CAFÉ'}});
    expect(screen.getByRole('button', {name:'Campanha de café'})).toBeTruthy();
    expect(screen.queryByRole('button', {name:'Vídeo de Natal'})).toBeNull();
  });
  it('salva o nome confirmado da conversa', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[]}))).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Campanha de café'})));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    fireEvent.click(within(await openConversationOptions()).getByRole('menuitem', {name:'Renomear conversa'}));
    expect(await screen.findByRole('dialog', {name:'Renomear conversa'})).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome da conversa')).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Nome da conversa'), {target:{value:'Campanha de café'}});
    fireEvent.click(screen.getByRole('button', {name:'Salvar nome'}));
    expect(await screen.findByRole('button', {name:'Campanha de café'})).toBeTruthy();
    expect(fetchMock.mock.calls[2][1]).toMatchObject({method:'PATCH',body:JSON.stringify({title:'Campanha de café'})});
  });
  it('mantém o nome anterior se falhar ao renomear', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[]}))).mockResolvedValueOnce(new Response('{}',{status:500})));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    fireEvent.click(within(await openConversationOptions()).getByRole('menuitem', {name:'Renomear conversa'}));
    fireEvent.change(screen.getByLabelText('Nome da conversa'), {target:{value:'Outro nome'}});
    fireEvent.click(screen.getByRole('button', {name:'Salvar nome'}));
    expect(await screen.findByText(/Não foi possível renomear/)).toBeTruthy();
    expect(screen.getByLabelText('Nome da conversa')).toHaveValue('Outro nome');
    fireEvent.click(screen.getByRole('button', {name:'Cancelar'}));
    expect(await screen.findByRole('button', {name:'Projeto'})).toBeTruthy();
  });
  it('permite abrir e fechar o histórico', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]))));
    render(<ChatPage />);
    const toggle = screen.getByRole('button', {name:'Mostrar conversas'});
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', {name:'Ocultar conversas'}).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', {name:'Ocultar conversas'}));
    expect(screen.getByRole('button', {name:'Mostrar conversas'}).getAttribute('aria-expanded')).toBe('false');
  });
  it('apresenta resposta formatada sem executar HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'a',role:'assistant',content:'**Sugestões**\n\n- Uma ideia\n\n<script>alert(1)</script>'}],approvals:[]}))));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect((await screen.findByText('Sugestões')).tagName).toBe('STRONG');
    expect(screen.getByText('Uma ideia').tagName).toBe('LI');
    expect(document.querySelector('.ady-chat-messages script')).toBeNull();
  });
  it('não carrega imagens externas e bloqueia links inseguros na resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'a',role:'assistant',content:'![imagem](https://example.invalid/tracker.png) [link](javascript:alert(1))'}],approvals:[]}))));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    const link = await screen.findByText('link');
    expect(link.getAttribute('href') || '').not.toMatch(/^javascript:/i);
    expect(document.querySelector('.ady-chat-messages img')).toBeNull();
  });
  it('envia mensagem ao pressionar Enter', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n')); c.close(); }});
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[]}))).mockResolvedValueOnce(new Response(stream));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    const input = await screen.findByLabelText('Mensagem');
    await waitFor(() => expect(input.hasAttribute('disabled')).toBe(false));
    fireEvent.change(input, {target:{value:'Olá'}});
    fireEvent.keyDown(input, {key:'Enter', code:'Enter'});
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
  it('não envia ao pressionar Shift e Enter', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[]})));
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    const input = await screen.findByLabelText('Mensagem');
    await waitFor(() => expect(input.hasAttribute('disabled')).toBe(false));
    fireEvent.change(input, {target:{value:'Olá'}});
    fireEvent.keyDown(input, {key:'Enter', code:'Enter', shiftKey:true});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('oculta a apresentação ao abrir uma conversa com mensagens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'u',role:'user',content:'Minha ideia'}],approvals:[]}))));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(await screen.findByText('Minha ideia')).toBeTruthy();
    expect(screen.queryByText('Como posso ajudar?')).toBeNull();
    expect(screen.queryByRole('button', {name:/Criar imagens/})).toBeNull();
  });
  it('mostra sugestões em uma conversa vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[]}))));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(await screen.findByRole('button', {name:/Criar imagens/})).toBeTruthy();
    expect(screen.getByText('Como posso ajudar?')).toBeTruthy();
  });
  it('identifica remetentes e rola até a mensagem mais recente', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'u',role:'user',content:'Minha ideia'},{id:'a',role:'assistant',content:'Resposta da Ady'}],approvals:[]}))));
    render(<ChatPage />);
    const conversation = document.querySelector('.ady-chat-messages') as HTMLElement;
    Object.defineProperty(conversation, 'scrollHeight', { configurable:true, value:800 });
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect((await screen.findByText('Minha ideia')).closest('article')?.getAttribute('data-role')).toBe('user');
    expect(screen.getByText('Resposta da Ady').closest('article')?.getAttribute('data-role')).toBe('assistant');
    await waitFor(() => expect(conversation.scrollTop).toBe(800));
  });
  /* Cenário: a falha ao carregar planos aumenta o conteúdo rolável
   * Dado que o usuário acompanha o fim da conversa
   * Quando o alerta de planos aparece após a abertura
   * Então a rolagem acompanha o novo fim sem deslocamento visível.
   */
  it('acompanha o fim da conversa quando aparece falha ao carregar planos', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('[{"id":"1","title":"Projeto"}]'))
      .mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'a',role:'assistant',content:'Resposta recente'}],approvals:[]}))));
    const {rerender} = render(<ChatPage/>);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    await screen.findByText('Resposta recente');
    const container = document.querySelector('.ady-chat-messages') as HTMLElement;
    Object.defineProperties(container, {scrollHeight:{configurable:true,value:1200},clientHeight:{configurable:true,value:300}});
    container.scrollTop = 100;
    chatPlanState.error = 'Não foi possível carregar os planos.';
    rerender(<ChatPage/>);
    expect(await screen.findByText('Não foi possível carregar os planos.')).toBeInTheDocument();
    expect(container.scrollTop).toBe(1200);
  });
  it('envia mensagem e exibe resposta', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: token\ndata: {"content":"Olá!"}\n\nevent: done\ndata: {}\n\n')); c.close(); }});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]))).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Nova conversa'}))).mockResolvedValueOnce(new Response(stream)));
    render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name: /nova conversa/i}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem').hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Oi'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    expect(await screen.findByText('Olá!')).toBeTruthy();
  });
  it('recupera a conversa após interrupção sem reenviar mensagem', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: token\ndata: {"content":"parcial"}\n\n')); c.close(); }});
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]))).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Nova conversa'}))).mockResolvedValueOnce(new Response(stream)).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Recuperada'}],approvals:[]})));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:/nova conversa/i}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem').hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Oi'}});
    fireEvent.click(screen.getByRole('button', {name:'Enviar mensagem'}));
    expect(await screen.findByText('Recuperada')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('confirma somente a ação apresentada', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a1',action:'Agendar',parameters:{data:'amanhã'},status:'pending'}]}))).mockResolvedValueOnce(new Response(JSON.stringify({status:'completed',result:{imageUrl:'https://example.com/image.png'}})));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage />);
    fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    fireEvent.click(await screen.findByRole('button', {name:'Confirmar ação'}));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toContain('/approvals/a1/confirm');
    await waitFor(() => expect(screen.queryByRole('button', {name:'Confirmar ação'})).toBeNull());
    expect(screen.getByRole('img', {name:'Imagem gerada'}).getAttribute('src')).toBe('https://example.com/image.png');
  });
  it('recupera resultados e apresenta orçamento diário em reais', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{dailyBudget:1500,currency:'BRL'},status:'pending'},{id:'b',action:'Criar vídeo',parameters:{},status:'completed',result:{videoUrl:'https://example.com/video.mp4'}},{id:'c',action:'Criar imagem',parameters:{},status:'completed',result:{imageUrl:'https://example.com/image.png'}}]}))));
    render(<ChatPage />); fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(await screen.findByText(/15,00/)).toBeTruthy();
    expect(screen.getByRole('img', {name:'Imagem gerada'})).toBeTruthy();
    expect(screen.getByLabelText('Vídeo gerado')).toBeTruthy();
  });
  it('solicita nova proposta se o recurso mudou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Cancelar postagem',parameters:{},status:'pending'}]}))).mockResolvedValueOnce(new Response('{}', {status:409})));
    render(<ChatPage />); fireEvent.click(await screen.findByRole('button', {name:'Projeto'})); fireEvent.click(await screen.findByRole('button', {name:'Confirmar ação'}));
    expect(await screen.findByText(/mudou.*nova proposta/i)).toBeTruthy();
    expect(screen.queryByRole('button', {name:'Confirmar ação'})).toBeNull();
  });
  it('acompanha job até o vídeo estar pronto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'v',action:'Editar vídeo',parameters:{},status:'completed',result:{jobId:'j',job:{status:'running'}}}]}))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'v',action:'Editar vídeo',parameters:{},status:'completed',result:{jobId:'j',job:{status:'done',videoUrl:'https://example.com/final.mp4'}}}]}))));
    render(<ChatPage />); fireEvent.click(await screen.findByRole('button', {name:'Projeto'}));
    expect(await screen.findByText(/Em andamento/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Interromper geração'})).toBeNull();
    expect(screen.getByText(/cancelamento.*indisponível/i)).toBeTruthy();
    expect(await screen.findByLabelText('Vídeo gerado', {}, {timeout:6000})).toBeTruthy();
  }, 8000);
  it('apresenta valores atuais, alterações e aviso em linguagem legível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Editar campanha',parameters:{atual:{name:'Campanha',dailyBudget:1500,currency:'BRL'},'alterações':{dailyBudget:2000},'observação':'Pode haver alteração externa.'},status:'pending'}]}))));
    render(<ChatPage />); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText('Valores atuais')).toBeTruthy();
    expect(screen.getByText('Alterações propostas')).toBeTruthy();
    expect(screen.getByText(/15,00/)).toBeTruthy(); expect(screen.getByText(/20,00/)).toBeTruthy();
    expect(screen.getByText('Pode haver alteração externa.')).toBeTruthy();
    expect(screen.queryByText(/dailyBudget/)).toBeNull();
  });
  it('retoma resposta interrompida sem reenviar mensagem', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: token\ndata: {"content":"Resposta retomada"}\n\nevent: done\ndata: {}\n\n')); c.close(); }});
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'u',role:'user',content:'Oi'}],approvals:[],response_run:{id:'r',status:'interrupted'}}))).mockResolvedValueOnce(new Response(stream));
    vi.stubGlobal('fetch',fetchMock); render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    fireEvent.click(await screen.findByRole('button',{name:'Retomar resposta'}));
    expect(await screen.findByText('Resposta retomada')).toBeTruthy();
    expect(fetchMock.mock.calls[2][0]).toContain('/conversations/1/retry');
    expect(screen.getAllByText('Oi')).toHaveLength(1);
  });
  it('acompanha resposta em andamento até permitir retomada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[],response_run:{id:'r',status:'running'}}))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[],response_run:{id:'r',status:'interrupted'}}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByRole('button',{name:'Retomar resposta'}, {timeout:6000})).toBeTruthy();
  }, 8000);
  it('não oferece nova confirmação quando o resultado é indeterminado', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{name:'Verão'},status:'pending'}]}))).mockResolvedValueOnce(new Response('{}',{status:502}));
    vi.stubGlobal('fetch',fetchMock); render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'})); fireEvent.click(await screen.findByRole('button',{name:'Confirmar ação'}));
    expect(await screen.findByText(/resultado.*não.*confirmado/i)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('não volta a oferecer confirmação ao atualizar após falha ambígua', async () => {
    const pending = {messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{},status:'pending'}]};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify(pending))).mockResolvedValueOnce(new Response('{}',{status:502})).mockResolvedValueOnce(new Response(JSON.stringify(pending))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'})); fireEvent.click(await screen.findByRole('button',{name:'Confirmar ação'}));
    await screen.findByText(/resultado.*não.*confirmado/i); fireEvent.click(screen.getByRole('button',{name:'Atualizar conversa'}));
    await screen.findByText(/resultado.*não.*confirmado/i);
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
  });
  it('mostra aviso ao reabrir ação com resultado incerto', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{},status:'failed'}]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText(/resultado.*não.*confirmado/i)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
  });
  it('exibe a resposta final mesmo quando não chegam tokens', async () => {
    const stream = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('event: done\ndata: {"message":{"id":"m","role":"assistant","content":"Resposta final"}}\n\n')); c.close(); }});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([]))).mockResolvedValueOnce(new Response(JSON.stringify({id:'1',title:'Nova conversa'}))).mockResolvedValueOnce(new Response(stream)));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:/nova conversa/i})); await waitFor(() => expect(screen.getByLabelText('Mensagem').hasAttribute('disabled')).toBe(false));
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Oi'}}); fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    expect(await screen.findByText('Resposta final')).toBeTruthy();
  });
  it('apresenta horário de agendamento com fuso explícito', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Agendar postagem',parameters:{scheduledAt:'2030-11-10T12:00:00Z'},status:'pending'}]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText(/10\/11\/2030.*09:00.*São Paulo/)).toBeTruthy();
  });
  it('impede trocar de conversa enquanto uma ação é confirmada', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'},{id:'2',title:'Outra conversa'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{},status:'pending'}]}))).mockImplementationOnce(() => new Promise(() => {})));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'})); fireEvent.click(await screen.findByRole('button',{name:'Confirmar ação'}));
    expect(screen.getByRole('button',{name:'Outra conversa'}).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button',{name:'Opções da conversa'}).hasAttribute('disabled')).toBe(true);
  });
  it('renova sessão expirada antes de carregar conversas', async () => {
    vi.mocked(refreshSession).mockResolvedValueOnce('token-renovado');
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'TOKEN_EXPIRED'}}),{status:401})).mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}])));
    vi.stubGlobal('fetch',fetchMock); render(<ChatPage/>);
    expect(await screen.findByRole('button',{name:'Projeto'})).toBeTruthy();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer token-renovado');
  });
  it('não renova sessão quando erro 401 não é expiração', async () => {
    vi.mocked(refreshSession).mockClear();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'INVALID_TOKEN'}}),{status:401})));
    render(<ChatPage/>); expect(await screen.findByRole('alert')).toBeTruthy(); expect(refreshSession).not.toHaveBeenCalled();
  });
  it('informa resultado desconhecido do vídeo sem oferecer nova confirmação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'v',action:'Criar vídeo',parameters:{},status:'completed',result:{jobId:'j',job:{status:'unknown',error:'Resultado não confirmado'}}}]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText(/resultado.*não.*confirmado/i)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
  });
  it('orienta verificar vídeo quando o resultado do worker é incerto', async () => {
    const aviso = 'Não foi possível confirmar o resultado do vídeo. Verifique antes de tentar novamente.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'v',action:'Criar vídeo',parameters:{},status:'completed',result:{jobId:'j',job:{status:'error',error:aviso}}}]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText(aviso)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Confirmar ação'})).toBeNull();
  });
  it('recupera conversa selecionada após recarregar a página', async () => {
    sessionStorage.setItem('ady-chat-current', '1');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'m',role:'assistant',content:'Mensagem recuperada'}],approvals:[]}))));
    render(<ChatPage/>); expect(await screen.findByText('Mensagem recuperada')).toBeTruthy();
  });
  it('mantém a última conversa escolhida quando respostas chegam fora de ordem', async () => {
    let resolveFirst!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => {resolveFirst = resolve;});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Primeira'},{id:'2',title:'Segunda'}]))).mockReturnValueOnce(pending).mockResolvedValueOnce(new Response(JSON.stringify({messages:[{id:'b',role:'assistant',content:'Conversa segunda'}],approvals:[]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Primeira'})); fireEvent.click(screen.getByRole('button',{name:'Segunda'}));
    expect(await screen.findByText('Conversa segunda')).toBeTruthy();
    await act(async () => { resolveFirst(new Response(JSON.stringify({messages:[{id:'a',role:'assistant',content:'Conversa antiga'}],approvals:[]}))); await new Promise(resolve => setTimeout(resolve,20)); });
    expect(screen.queryByText('Conversa antiga')).toBeNull();
  });
  it('não exibe valor em reais quando a moeda não foi confirmada', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{id:'1',title:'Projeto'}]))).mockResolvedValueOnce(new Response(JSON.stringify({messages:[],approvals:[{id:'a',action:'Criar campanha',parameters:{dailyBudget:1500},status:'expired'}]}))));
    render(<ChatPage/>); fireEvent.click(await screen.findByRole('button',{name:'Projeto'}));
    expect(await screen.findByText(/1500.*moeda não confirmada/i)).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
  it('exibe erro quando não consegue carregar conversas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ChatPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
  it('não envia mensagem vazia', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal('fetch', fetchMock); render(<ChatPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', {name:'Enviar mensagem'}).hasAttribute('disabled')).toBe(true);
  });
});
