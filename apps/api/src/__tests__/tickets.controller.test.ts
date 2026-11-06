/**
 * Funcionalidade: abertura de tickets pelo superadmin
 *
 * Cenário: abrir um ticket válido
 * Dado que um superadmin preenche e-mail, assunto, descrição, prioridade e nível
 * Quando envia o formulário
 * Então a API cria o ticket e responde 201 com o link do ClickUp
 *
 * Cenário: rejeitar dados inválidos
 * Dado que o corpo tem e-mail ou nível inválido
 * Quando a API recebe a requisição
 * Então responde 400 sem chamar a integração
 *
 * Cenário: ClickUp indisponível
 * Dado que o provedor externo falha
 * Quando o ticket é aberto
 * Então a API devolve um erro seguro, sem segredo ou payload do provedor
 *
 * Cenário: classificar um ticket
 * Dado que há uma etiqueta de escopo e duas etiquetas de área
 * Quando o superadmin abre o chamado
 * Então a API preserva a classificação para a integração
 *
 * Cenário: rejeitar uma área isolada
 * Dado que há somente uma etiqueta de área
 * Quando a API recebe o chamado
 * Então responde 400 sem chamar a integração
 *
 * Cenário: acompanhar tickets
 * Dado que há chamados pendentes, em progresso e concluídos
 * Quando o superadmin abre a tela
 * Então recebe as listas Abertos e Resolvidos separadas
 *
 * Cenário: receber ticket multipart com anexos
 * Dado que o formulário envia campos textuais como multipart
 * Quando o superadmin abre o chamado com uma evidência
 * Então a API converte os campos e encaminha o arquivo ao serviço
 *
 * Cenário: falha parcial de anexos
 * Dado que o ClickUp criou a tarefa mas falhou ao anexar um arquivo
 * Quando a API devolve o erro ao painel
 * Então preserva apenas a URL segura da tarefa criada
 *
 * Cenário: consultar e alterar status
 * Dado que o superadmin acessa a fila e confirma um destino válido
 * Quando consulta ou altera o status
 * Então recebe a opção dinâmica ou o ticket atualizado
 *
 * Cenário: conflito de status
 * Dado que o ticket mudou no ClickUp
 * Quando confirma o status antigo
 * Então recebe conflito seguro

 * Cenário: aprovar ticket em homologação
 * Dado que o superadmin escolheu aprovar um ticket
 * Quando envia a revisão válida
 * Então a API confirma o status Aprovado
 *
 * Cenário: reprovar ticket com motivo
 * Dado que o superadmin informou o motivo da reprovação
 * Quando envia a revisão válida
 * Então a API encaminha decisão e motivo para o serviço
 *
 * Cenário: exigir motivo para reprovar
 * Dado que o superadmin escolheu reprovar sem motivo válido
 * Quando envia a revisão
 * Então a API rejeita a entrada sem chamar o ClickUp
 *
 * Cenário: tratar ticket que deixou de estar em homologação
 * Dado que o ClickUp informa conflito de status
 * Quando a revisão é enviada
 * Então a API devolve erro seguro de conflito
 *
 * Cenário: ClickUp indisponível durante a revisão
 * Dado que o provedor retorna uma falha com detalhes privados
 * Quando o serviço tenta salvar a decisão
 * Então devolve erro seguro sem expor os detalhes

 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketsController } from '../controllers/tickets.controller.js';
import { TicketService } from '../services/tickets/ticket.service.js';
import { ClickUpTicketsError } from '../lib/clickup-tickets.client.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const validInput = {
  email: 'cliente@empresa.com',
  subject: 'Erro ao publicar campanha',
  description: 'A publicação falha depois de confirmar os dados.',
  priority: 'high',
  level: 'N1',
  assigneeId: 101281834,
  labels: ['app', 'meta', 'sincronizacao-dados'],
};

describe('TicketsController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria o ticket e responde 201', async () => {
    const service = { createTicket: vi.fn().mockResolvedValue({ clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' }) };
    const response = mockRes();
    await new TicketsController(service as any).create({ body: validInput } as any, response, vi.fn());

    expect(service.createTicket).toHaveBeenCalledWith(validInput);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ clickupTaskId: 'task-123' }) }));
  });

  it('rejeita corpo inválido sem chamar o serviço', async () => {
    const service = { createTicket: vi.fn() };
    const next = vi.fn();
    await new TicketsController(service as any).create({ body: { ...validInput, email: 'inválido', level: 'N9' } } as any, mockRes(), next);

    expect(service.createTicket).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('aceita N5 para solicitações de feature', async () => {
    const service = { createTicket: vi.fn().mockResolvedValue({ clickupTaskId: 'feature-123', clickupTaskUrl: 'https://app.clickup.com/t/feature-123' }) };
    const response = mockRes();
    const input = { ...validInput, level: 'N5', subject: 'Exportar relatórios em CSV' };

    await new TicketsController(service as any).create({ body: input } as any, response, vi.fn());

    expect(service.createTicket).toHaveBeenCalledWith(input);
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('aceita ticket sem etiquetas de escopo ou área', async () => {
    const service = { createTicket: vi.fn().mockResolvedValue({ clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' }) };
    const response = mockRes();
    const { labels: _labels, ...input } = validInput;

    await new TicketsController(service as any).create({ body: input } as any, response, vi.fn());

    expect(service.createTicket).toHaveBeenCalledWith({ ...input, labels: [] });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('normaliza campos multipart e encaminha os anexos', async () => {
    const service = { createTicket: vi.fn().mockResolvedValue({ clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' }) };
    const response = mockRes();
    const file = { buffer: Buffer.from('imagem'), originalname: 'erro.png', mimetype: 'image/png' };
    const multipartBody = { ...validInput, assigneeId: '101281834', labels: JSON.stringify(validInput.labels) };

    await new TicketsController(service as any).create({ body: multipartBody, files: [file] } as any, response, vi.fn());

    expect(service.createTicket).toHaveBeenCalledWith({ ...validInput, attachments: [{ buffer: file.buffer, filename: 'erro.png', mimeType: 'image/png' }] });
  });

  it('preserva o link seguro da tarefa em uma falha parcial de anexos', async () => {
    const client = { createTicket: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, 'CLICKUP_ATTACHMENT_FAILED', 'detalhe privado', 'https://app.clickup.com/t/task-123')) };
    const next = vi.fn();

    await new TicketsController(new TicketService(client as any)).create({ body: validInput } as any, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 502,
      code: 'TICKET_ATTACHMENTS_UNAVAILABLE',
      details: { clickupTaskUrl: 'https://app.clickup.com/t/task-123' },
    }));
  });

  it('valida e encaminha a alteração de status', async () => {
    const service = { updateTicketStatus: vi.fn().mockResolvedValue({ id: 'task-1', status: 'review_spec', statusType: 'custom' }) };
    const response = mockRes();
    await new TicketsController(service as any).updateStatus({ params: { ticketId: 'task-1' }, body: { expectedStatus: 'triagem', status: 'review_spec' } } as any, response, vi.fn());
    expect(service.updateTicketStatus).toHaveBeenCalledWith('task-1', { expectedStatus: 'triagem', status: 'review_spec' });
  });

  it('propaga somente erro seguro quando o ClickUp está indisponível', async () => {
    const client = { createTicket: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'token=segredo payload=privado')) };
    const service = new TicketService(client as any);
    const next = vi.fn();
    await new TicketsController(service).create({ body: validInput } as any, mockRes(), next);

    const error = next.mock.calls[0][0] as Error & { statusCode?: number; code?: string };
    expect(error).toMatchObject({ statusCode: 502, code: 'TICKET_PROVIDER_UNAVAILABLE' });
    expect(error.message).not.toContain('segredo');
    expect(error.message).not.toContain('privado');
  });

  it('separa chamados abertos e resolvidos para a tela administrativa', async () => {
    const client = {
      createTicket: vi.fn(),
      listTickets: vi.fn().mockResolvedValue([
        { id: 'open-1', status: 'pendente', statusType: 'open' },
        { id: 'open-2', status: 'em progresso', statusType: 'custom' },
        { id: 'done-1', status: 'concluído', statusType: 'closed' },
      ]),
    };
    const response = mockRes();
    await new TicketsController(new TicketService(client as any)).list({} as any, response, vi.fn());

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { open: [expect.objectContaining({ id: 'open-1' }), expect.objectContaining({ id: 'open-2' })], resolved: [expect.objectContaining({ id: 'done-1' })] },
      partial_failures: [],
    }));
  });

  it('retorna falha parcial segura se a consulta ClickUp falhar', async () => {
    const client = { createTicket: vi.fn(), listTickets: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'token=segredo')) };
    const response = mockRes();
    await new TicketsController(new TicketService(client as any)).list({} as any, response, vi.fn());

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: { open: [], resolved: [] },
      partial_failures: [{ provider: 'clickup', reason: 'provider_unavailable' }],
    }));
  });

  it('lista os responsáveis disponíveis', async () => {
    const service = { createTicket: vi.fn(), listTickets: vi.fn(), listAssignees: vi.fn().mockResolvedValue([{ id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br' }]) };
    const response = mockRes();
    await new TicketsController(service as any).listAssignees({} as any, response, vi.fn());

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: [{ id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br' }] }));
  });

  it('lista status dinâmicos', async () => {
    const service = { listStatuses: vi.fn().mockResolvedValue([{ value: 'triagem', label: 'triagem', type: 'open' }]) };
    const response = mockRes();
    await new TicketsController(service as any).listStatuses({} as any, response, vi.fn());
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [{ value: 'triagem', label: 'triagem', type: 'open' }] }));
  });

  it('valida e encaminha a alteração de status', async () => {
    const service = { updateTicketStatus: vi.fn().mockResolvedValue({ id: 'task-1', status: 'review_spec' }) };
    const response = mockRes();
    await new TicketsController(service as any).updateStatus({ params: { ticketId: 'task-1' }, body: { expectedStatus: 'triagem', status: 'review_spec' } } as any, response, vi.fn());
    expect(service.updateTicketStatus).toHaveBeenCalledWith('task-1', { expectedStatus: 'triagem', status: 'review_spec' });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { id: 'task-1', status: 'review_spec' } }));
  });

  it('rejeita status de destino igual ao atual antes do serviço', async () => {
    const service = { updateTicketStatus: vi.fn() };
    const next = vi.fn();
    await new TicketsController(service as any).updateStatus({ params: { ticketId: 'task-1' }, body: { expectedStatus: 'triagem', status: 'triagem' } } as any, mockRes(), next);
    expect(service.updateTicketStatus).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('rejeita destino que não existe na lista sem mutar o ClickUp', async () => {
    const client = {
      listStatuses: vi.fn().mockResolvedValue([{ value: 'triagem', label: 'triagem', type: 'open' }]),
      updateTicketStatus: vi.fn(),
    };
    const error = await new TicketService(client as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'desconhecido' }).catch((reason) => reason);
    expect(error).toMatchObject({ statusCode: 400, code: 'INVALID_TICKET_STATUS' });
    expect(client.updateTicketStatus).not.toHaveBeenCalled();
  });

  it('converte ticket fora da lista em 404 sem expor detalhes do provedor', async () => {
    const client = {
      listStatuses: vi.fn().mockResolvedValue([{ value: 'triagem', label: 'triagem', type: 'open' }]),
      updateTicketStatus: vi.fn().mockRejectedValue(new ClickUpTicketsError(404, 'CLICKUP_TASK_OUT_OF_SCOPE', 'lista privada=segredo')),
    };
    const error = await new TicketService(client as any).updateTicketStatus('task-1', { expectedStatus: 'pendente', status: 'triagem' }).catch((reason) => reason);
    expect(error).toMatchObject({ statusCode: 404, code: 'TICKET_NOT_FOUND' });
    expect(error.message).not.toContain('segredo');
  });

  it('aprova ticket em homologação e retorna o novo status', async () => {
    const service = { reviewTicket: vi.fn().mockResolvedValue({ status: 'Aprovado' }) };
    const response = mockRes();
    await new TicketsController(service as any).review({ params: { id: 'task-123' }, body: { decision: 'approve' } } as any, response, vi.fn());

    expect(service.reviewTicket).toHaveBeenCalledWith('task-123', { decision: 'approve' });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Aprovado' } }));
  });

  it('encaminha motivo de reprovação após validá-lo', async () => {
    const service = { reviewTicket: vi.fn().mockResolvedValue({ status: 'Implement' }) };
    const response = mockRes();
    await new TicketsController(service as any).review({ params: { id: 'task-123' }, body: { decision: 'reject', reason: '  Corrigir o fluxo.  ' } } as any, response, vi.fn());

    expect(service.reviewTicket).toHaveBeenCalledWith('task-123', { decision: 'reject', reason: 'Corrigir o fluxo.' });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Implement' } }));
  });

  it('rejeita motivo vazio e decisão desconhecida sem chamar o serviço', async () => {
    const service = { reviewTicket: vi.fn() };
    const next = vi.fn();
    const controller = new TicketsController(service as any);
    await controller.review({ params: { id: 'task-123' }, body: { decision: 'reject', reason: '  ' } } as any, mockRes(), next);
    await controller.review({ params: { id: 'task-123' }, body: { decision: 'later' } } as any, mockRes(), next);

    expect(service.reviewTicket).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0][0]).toMatchObject({ name: 'ZodError' });
  });

  it('converte conflito de status em erro 409 seguro', async () => {
    const client = { reviewTicket: vi.fn().mockRejectedValue(new ClickUpTicketsError(409, 'CLICKUP_REVIEW_CONFLICT', 'O chamado não está mais em homologação.')) };
    const error = await new TicketService(client as any).reviewTicket('task-123', { decision: 'approve' }).catch((cause) => cause);

    expect(error).toMatchObject({ statusCode: 409, code: 'TICKET_REVIEW_CONFLICT' });
  });

  it('não expõe detalhes privados quando o ClickUp falha ao salvar a revisão', async () => {
    const client = { reviewTicket: vi.fn().mockRejectedValue(new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'token=secreto payload=privado')) };
    const error = await new TicketService(client as any).reviewTicket('task-123', { decision: 'approve' }).catch((cause) => cause);

    expect(error).toMatchObject({ statusCode: 502, code: 'TICKET_REVIEW_UNAVAILABLE' });
    expect(error.message).not.toContain('secreto');
    expect(error.message).not.toContain('privado');

  });
});
