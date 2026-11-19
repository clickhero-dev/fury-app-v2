// @vitest-environment jsdom
/*
Funcionalidade: revisar e acompanhar um plano na conversa
Cenário: aprovar pelo teclado
Dado um plano proposto, Quando aprovo com Enter, Então envio sua versão sem inventar progresso.
Cenário: falha ao aprovar ou cancelar
Dado um serviço indisponível, Quando confirmo a ação, Então preservo o plano e posso tentar novamente.
Cenário: editar um rascunho
Dado um plano ainda não aprovado, Quando edito e salvo, Então envio títulos e objetivo com a versão revisada.
Cenário: edição desatualizada
Dado um rascunho local, Quando chega outra versão, Então mantenho a edição e ofereço recarregá-la.
Cenário: restringir conclusão manual
Dado tarefas automáticas e manuais, Quando acompanho o plano, Então só tarefas manuais liberadas permitem confirmação.
Cenário: distinguir aprovação de pausa
Dado uma ação pendente, Quando vejo o plano, Então não confundo aprovação com conclusão ou pausa.
Cenário: evidências seguras
Dado resultados com campos extras, Quando abro o plano, Então só vejo evidências textuais sem links ou HTML executável.
Cenário: resultado curto legível sem abrir detalhes
Dado uma tarefa concluída com texto curto, Quando olho o plano, Então vejo o título e seu resultado completos.
Cenário: controles compactos e responsivos
Dado uma conversa estreita, Quando vejo as ações, Então encontro classes responsivas e controles nativos acessíveis.
Cenário: devolver foco após revisar
Dado um editor ou confirmação abertos, Quando desisto, Então o foco volta ao controle que abriu a revisão.
Cenário: preservar rascunho quando a execução começa em outra sessão
Dado uma edição não salva, Quando o plano deixa de ser rascunho, Então vejo meus textos sem poder salvar alterações na execução.
Cenário: validar campos sem apagar valores
Dado um título vazio, Quando tento salvar, Então vejo orientação com foco e nenhuma alteração é enviada.
*/
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPlanCard, type ChatPlanCardProps } from './ChatPlanCard';
import type { ChatPlan, ChatPlanTask } from './chat-plans';

function task(overrides: Partial<ChatPlanTask> = {}): ChatPlanTask {
  return { id: 'task-1', key: 'marca', title: 'Consultar a marca', capability: 'read_brand', parameters: {}, dependsOn: [], status: 'pending', ...overrides };
}
function plan(overrides: Partial<ChatPlan> = {}): ChatPlan {
  return { id: 'plan-1', conversationId: 'conversation-1', title: 'Publicações da semana', goal: 'Preparar conteúdos alinhados à marca.', status: 'draft', version: 3, tasks: [task()], createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-10T12:00:00Z', ...overrides };
}
function props(overrides: Partial<ChatPlanCardProps> = {}): ChatPlanCardProps {
  return { plan: plan(), onAction: vi.fn().mockResolvedValue(true), onEdit: vi.fn().mockResolvedValue(true), onCompleteTask: vi.fn().mockResolvedValue(true), ...overrides };
}
afterEach(cleanup);

describe('Plano dentro da conversa', () => {
  it('mostra parâmetros das tarefas como texto para revisão, sem prometer edição pelo chat', async () => {
    const user = userEvent.setup();
    const campaign = task({ id: 'task-2', key: 'campaign', title: 'Campanha', capability: 'propose_campaign', parameters: { name: 'Café', objective: 'OUTCOME_TRAFFIC', daily_budget_cents: 1500, ad_account_id: 'act_123' }, dependsOn: ['marca'] });
    render(<ChatPlanCard {...props({ plan: plan({ tasks: [task(), campaign] }) })} />);
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('act_123')).toBeInTheDocument();
    expect(screen.getByText('Depende de: Consultar a marca.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    expect(screen.queryByText(/peça uma revisão nesta conversa/i)).toBeNull();
    expect(screen.getByText(/não é possível alterar instruções, datas ou valores/i)).toBeInTheDocument();
  });

  it('não expõe parâmetros desconhecidos ou objetos aninhados', () => {
    const item = task({ capability: 'draft_text', parameters: { prompt: { private: 'segredo interno' }, token: 'token secreto' } });
    render(<ChatPlanCard {...props({ plan: plan({ tasks: [item] }) })} />);
    expect(screen.queryByText('token secreto')).toBeNull();
    expect(screen.queryByText('segredo interno')).toBeNull();
    expect(screen.getAllByText('Detalhe indisponível para visualização.')).toHaveLength(2);
  });

  it('acompanha plano complexo sem contar falhas nem aprovações como concluídas', () => {
    const tasks = [
      task({ status: 'completed', result: { summary: 'Marca consultada.' } }),
      task({ id: 'task-2', key: 'texto', title: 'Preparar texto', capability: 'draft_text', parameters: { prompt: 'Criar legenda' }, dependsOn: ['marca'], status: 'completed' }),
      task({ id: 'task-3', key: 'imagem', title: 'Criar imagem', capability: 'propose_image', parameters: { prompt: 'Criar imagem', reference_image_urls: ['https://example.test/a.png', 'https://example.test/b.png'] }, dependsOn: ['texto'], status: 'waiting_approval', approvalId: 'approval-1' }),
      task({ id: 'task-4', key: 'revisao', title: 'Revisar', capability: 'manual', parameters: { instructions: 'Conferir a campanha' }, dependsOn: ['imagem'], status: 'pending' }),
    ] as ChatPlanTask[];
    const input = props({ plan: plan({ status: 'waiting_approval', tasks }) });
    const view = render(<ChatPlanCard {...input} />);
    expect(screen.getByText('2 de 4 tarefas concluídas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveValue(2);
    expect(screen.queryByRole('button', { name: 'Concluir tarefa Revisar' })).toBeNull();
    expect(screen.getByText('https://example.test/a.png, https://example.test/b.png')).toBeInTheDocument();
    view.rerender(<ChatPlanCard {...input} plan={plan({ status: 'failed', version: 4, tasks: tasks.map(item => item.key === 'imagem' ? { ...item, status: 'failed', error: 'A imagem falhou.' } : item) })} />);
    expect(screen.getByText('2 de 4 tarefas concluídas')).toBeInTheDocument();
    expect(screen.getByText('A imagem falhou.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar plano' })).toBeEnabled();
  });

  it('exibe títulos e resultados curtos completos sem exigir outro clique', () => {
    render(<ChatPlanCard {...props({ plan: plan({ status: 'completed', tasks: [task({ status: 'completed', result: { summary: 'Texto preparado.', text: 'Conheça uma marca feita para você.' } })] }) })} />);
    expect(screen.getByText('Consultar a marca', { exact: true })).toBeVisible();
    expect(screen.getByText('Conheça uma marca feita para você.', { exact: true })).toBeVisible();
  });

  it('devolve foco após descartar edição ou desistir do cancelamento', async () => {
    const user = userEvent.setup();
    render(<ChatPlanCard {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    expect(screen.getByLabelText('Título do plano')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.getByRole('button', { name: 'Editar plano' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancelar restantes' }));
    expect(screen.getByRole('button', { name: 'Manter plano' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Manter plano' }));
    expect(screen.getByRole('button', { name: 'Cancelar restantes' })).toHaveFocus();
  });

  it('preserva textos editados quando outra sessão começa a execução', async () => {
    const user = userEvent.setup();
    const input = props();
    const view = render(<ChatPlanCard {...input} />);
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    fireEvent.change(screen.getByLabelText('Título do plano'), { target: { value: 'Meu rascunho não salvo' } });
    view.rerender(<ChatPlanCard {...input} plan={plan({ status: 'running', version: 4 })} />);
    expect(screen.getByLabelText('Título do plano')).toHaveValue('Meu rascunho não salvo');
    expect(screen.getByLabelText('Título do plano')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    expect(screen.getByText(/suas alterações não foram salvas/i)).toBeInTheDocument();
    expect(input.onEdit).not.toHaveBeenCalled();
  });

  it('explica título vazio e mantém os outros campos com foco no resumo dos erros', async () => {
    const user = userEvent.setup();
    const input = props();
    render(<ChatPlanCard {...input} />);
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    fireEvent.change(screen.getByLabelText('Título do plano'), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByLabelText('Título do plano')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Objetivo do plano')).toHaveValue(input.plan.goal);
    expect(input.onEdit).not.toHaveBeenCalled();
  });

  it('aprova pelo teclado com o plano revisado e sem progresso otimista', async () => {
    const user = userEvent.setup();
    let finish!: (value: boolean) => void;
    const input = props({ onAction: vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })) });
    render(<ChatPlanCard {...input} />);
    expect(screen.getByRole('article', { name: 'Plano: Publicações da semana' })).toBeInTheDocument();
    expect(screen.getByText('Preparar conteúdos alinhados à marca.')).toBeInTheDocument();
    expect(screen.getByText('0 de 1 tarefas concluídas')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Aprovar e executar' });
    approve.focus();
    await user.keyboard('{Enter}');
    expect(input.onAction).toHaveBeenCalledWith(input.plan, 'approve');
    expect(approve).toBeDisabled();
    expect(screen.getByText('Pronto para revisar')).toBeInTheDocument();
    await act(async () => { finish(true); });
    expect(approve).toBeEnabled();
  });

  it.each(['approve', 'cancel'] as const)('preserva estado quando %s falha e libera uma nova tentativa', async action => {
    const user = userEvent.setup();
    const input = props({ onAction: vi.fn().mockRejectedValue(new Error('payload privado')) });
    render(<ChatPlanCard {...input} />);
    if (action === 'cancel') {
      await user.click(screen.getByRole('button', { name: 'Cancelar restantes' }));
      expect(screen.getByText(/não desfaz o que já foi feito/i)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    } else await user.click(screen.getByRole('button', { name: 'Aprovar e executar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar o plano.');
    expect(screen.queryByText('payload privado')).toBeNull();
    expect(screen.getByText('0 de 1 tarefas concluídas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action === 'cancel' ? 'Confirmar cancelamento' : 'Aprovar e executar' })).toBeEnabled();
  });

  it('salva títulos e objetivo com a versão original e sem editar parâmetros técnicos', async () => {
    const user = userEvent.setup();
    const input = props();
    render(<ChatPlanCard {...input} />);
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    await user.clear(screen.getByLabelText('Título do plano'));
    await user.type(screen.getByLabelText('Título do plano'), 'Conteúdos de novembro');
    await user.clear(screen.getByLabelText('Objetivo do plano'));
    await user.type(screen.getByLabelText('Objetivo do plano'), 'Revisar a comunicação.');
    await user.clear(screen.getByLabelText('Título da tarefa 1'));
    await user.type(screen.getByLabelText('Título da tarefa 1'), 'Revisar a marca');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(input.onEdit).toHaveBeenCalledWith(input.plan, {
      version: 3, title: 'Conteúdos de novembro', goal: 'Revisar a comunicação.',
      tasks: [{ key: 'marca', title: 'Revisar a marca', capability: 'read_brand', parameters: {}, dependsOn: [] }],
    });
    expect(screen.queryByLabelText(/json|parâmetros/i)).toBeNull();
  });

  it('mantém o rascunho após conflito e recarrega somente por escolha explícita', async () => {
    const user = userEvent.setup();
    const input = props({ onEdit: vi.fn().mockResolvedValue(false) });
    const view = render(<ChatPlanCard {...input} />);
    await user.click(screen.getByRole('button', { name: 'Editar plano' }));
    fireEvent.change(screen.getByLabelText('Título do plano'), { target: { value: 'Minha revisão' } });
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    view.rerender(<ChatPlanCard {...input} plan={plan({ title: 'Revisão de outra sessão', version: 4 })} error="O plano mudou. Revise a versão atual antes de tentar novamente." />);
    expect(screen.getByLabelText('Título do plano')).toHaveValue('Minha revisão');
    expect(screen.getByRole('alert')).toHaveTextContent('O plano mudou');
    await user.click(screen.getByRole('button', { name: 'Recarregar edição' }));
    expect(screen.getByLabelText('Título do plano')).toHaveValue('Revisão de outra sessão');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(input.onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ version: 4 }), expect.objectContaining({ version: 4 }));
  });

  it('permite concluir só tarefa manual com dependências completas e plano aprovado', async () => {
    const user = userEvent.setup();
    const manual = task({ id: 'task-2', key: 'revisao', title: 'Revisar o texto', capability: 'manual', parameters: { instructions: 'Confira o tom da marca.' }, dependsOn: ['marca'] });
    const input = props({ plan: plan({ status: 'running', tasks: [task({ status: 'completed', result: { summary: 'Marca consultada.' } }), manual] }) });
    const view = render(<ChatPlanCard {...input} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Concluir tarefa Consultar a marca' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Concluir tarefa Revisar o texto' }));
    expect(input.onCompleteTask).toHaveBeenCalledWith(input.plan, manual);
    expect(screen.getByText('1 de 2 tarefas concluídas')).toBeInTheDocument();
    view.rerender(<ChatPlanCard {...input} plan={plan({ status: 'running', tasks: [task(), manual] })} />);
    expect(screen.queryByRole('button', { name: 'Concluir tarefa Revisar o texto' })).toBeNull();
    view.rerender(<ChatPlanCard {...input} plan={plan({ tasks: [manual] })} />);
    expect(screen.queryByRole('button', { name: /Concluir tarefa/ })).toBeNull();
  });

  it('distingue aprovação pendente de pausa e não conta propostas como concluídas', async () => {
    const user = userEvent.setup();
    const input = props({ plan: plan({ status: 'waiting_approval', tasks: [task({ status: 'waiting_approval', capability: 'propose_image', approvalId: 'approval-1', result: { summary: 'Proposta preparada, aguardando autorização.' } })] }) });
    const view = render(<ChatPlanCard {...input} />);
    expect(screen.getAllByText('Aguardando sua aprovação').length).toBeGreaterThan(0);
    expect(screen.getByText('0 de 1 tarefas concluídas')).toBeInTheDocument();
    expect(screen.getByText(/revise a ação pendente nesta conversa/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pausar plano' }));
    expect(input.onAction).toHaveBeenCalledWith(input.plan, 'pause');
    view.rerender(<ChatPlanCard {...input} plan={plan({ status: 'paused' })} />);
    expect(screen.getByText('Plano pausado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar plano' }));
    expect(input.onAction).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paused' }), 'resume');
  });

  it('mostra somente evidências permitidas e erros sem interpretar HTML ou links arbitrários', () => {
    const input = props({ plan: plan({ status: 'failed', tasks: [task({ status: 'completed', result: { summary: 'Marca encontrada', text: '<img src=x onerror=alert(1)>', reference: { kind: 'brand', id: 'brand-123' }, url: 'https://malicioso.invalid', raw: { token: 'segredo' } } }), task({ id: 'task-2', key: 'imagem', title: 'Preparar imagem', capability: 'propose_image', status: 'failed', error: 'A geração não foi concluída. Tente novamente.' })] }) });
    const view = render(<ChatPlanCard {...input} />);
    expect(screen.getByText('Marca encontrada')).toBeInTheDocument();
    expect(screen.getByText(/brand-123/)).toBeInTheDocument();
    expect(screen.getByText('A geração não foi concluída. Tente novamente.')).toBeInTheDocument();
    expect(view.container.querySelector('img, a[href], pre, code')).toBeNull();
    expect(view.container).not.toHaveTextContent('segredo');
    expect(view.container).not.toHaveTextContent('malicioso.invalid');
  });

  it('mantém classes móveis, progresso nativo e controles com foco sem desabilitar por falha', () => {
    const input = props({ error: 'Aguarde um pouco e tente novamente.' });
    render(<ChatPlanCard {...input} />);
    const article = screen.getByRole('article');
    expect(article).toHaveClass('ady-chat-plan');
    expect(article.querySelector('.ady-chat-plan-actions')).not.toBeNull();
    const progress = screen.getByRole('progressbar', { name: 'Tarefas concluídas' });
    expect(progress).toHaveAttribute('value', '0');
    expect(progress).toHaveAttribute('max', '1');
    for (const button of within(article).getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toBeEnabled();
    }
  });
});
