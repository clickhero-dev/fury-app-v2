/**
 * Funcionalidade: alterar status de tickets pelo painel
 *
 * Cenário: atualizar um ticket no status exibido
 * Dado que o ticket pertence à lista configurada e mantém seu status
 * Quando o superadmin escolhe um status válido diferente
 * Então o serviço atualiza somente o status no ClickUp
 *
 * Cenário: detectar status obsoleto
 * Dado que o ticket mudou de status externamente
 * Quando o superadmin confirma a seleção antiga
 * Então a operação retorna conflito sem enviar atualização
 *
 * Cenário: impedir ticket fora do escopo
 * Dado que a tarefa pertence a outra lista
 * Quando o superadmin tenta alterar o status
 * Então a operação retorna não encontrado sem mutação
 */
import { describe, expect, it, vi } from 'vitest';
import { TicketService } from '../services/tickets/ticket.service.js';

const baseTicket = { id: 'task-1', status: 'triagem', statusType: 'custom', listId: 'list-1' };
const statuses = [{ name: 'triagem', type: 'custom' }, { name: 'review_spec', type: 'custom' }, { name: 'concluído', type: 'closed' }];

function client(over: Record<string, unknown> = {}) {
  return {
    createTicket: vi.fn(), listTickets: vi.fn(), listMembers: vi.fn(),
    listStatuses: vi.fn().mockResolvedValue(statuses), getTicket: vi.fn().mockResolvedValue(baseTicket),
    updateTicketStatus: vi.fn().mockResolvedValue({ ...baseTicket, status: 'review_spec' }),
    getConfiguredListId: vi.fn().mockReturnValue('list-1'), ...over,
  };
}

describe('TicketService status', () => {
  it('atualiza somente o status depois de reler a tarefa', async () => {
    const c = client();
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).resolves.toMatchObject({ status: 'review_spec' });
    expect(c.listStatuses).toHaveBeenCalledOnce();
    expect(c.getTicket).toHaveBeenCalledWith('task-1');
    expect(c.updateTicketStatus).toHaveBeenCalledWith('task-1', 'review_spec');
  });

  it('não envia PUT quando o status exibido ficou obsoleto', async () => {
    const c = client({ getTicket: vi.fn().mockResolvedValue({ ...baseTicket, status: 'implement' }) });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).rejects.toMatchObject({ statusCode: 409, code: 'TICKET_STATUS_CONFLICT' });
    expect(c.updateTicketStatus).not.toHaveBeenCalled();
  });

  it('não altera uma tarefa de outra lista', async () => {
    const c = client({ getTicket: vi.fn().mockResolvedValue({ ...baseTicket, listId: 'other-list' }) });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).rejects.toMatchObject({ statusCode: 404, code: 'TICKET_NOT_FOUND' });
    expect(c.updateTicketStatus).not.toHaveBeenCalled();
  });

  it('rejeita destino desconhecido ou igual sem ler a tarefa', async () => {
    const c = client();
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'desconhecido' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TICKET_STATUS' });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'triagem' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TICKET_STATUS' });
    expect(c.getTicket).not.toHaveBeenCalled();
  });
});
