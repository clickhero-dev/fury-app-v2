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
 * Cenário: acompanhar tickets
 * Dado que há chamados pendentes, em progresso e concluídos
 * Quando o superadmin abre a tela
 * Então recebe as listas Abertos e Resolvidos separadas
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
});
