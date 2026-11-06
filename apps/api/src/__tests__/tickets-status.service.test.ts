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
import { ClickUpTicketsError } from '../lib/clickup-tickets.client.js';
import { TicketService } from '../services/tickets/ticket.service.js';

const statuses = [{ value: 'triagem', label: 'triagem', type: 'custom' }, { value: 'review_spec', label: 'review_spec', type: 'custom' }, { value: 'concluído', label: 'concluído', type: 'closed' }];

function client(over: Record<string, unknown> = {}) {
  return {
    createTicket: vi.fn(), listTickets: vi.fn(), listMembers: vi.fn(),
    listStatuses: vi.fn().mockResolvedValue(statuses),
    updateTicketStatus: vi.fn().mockResolvedValue({ id: 'task-1', listId: 'list-1', status: 'review_spec', statusType: 'custom' }),
    reviewTicket: vi.fn(), ...over,
  };
}

describe('TicketService status', () => {
  it('atualiza somente o status depois de reler a tarefa', async () => {
    const c = client();
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).resolves.toMatchObject({ status: 'review_spec' });
    expect(c.listStatuses).toHaveBeenCalledOnce();
    expect(c.updateTicketStatus).toHaveBeenCalledWith('task-1', 'triagem', 'review_spec');
  });

  it('converte status obsoleto em conflito seguro', async () => {
    const c = client({ updateTicketStatus: vi.fn().mockRejectedValue(new ClickUpTicketsError(409, 'CLICKUP_STATUS_CONFLICT', 'stale')) });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).rejects.toMatchObject({ statusCode: 409, code: 'TICKET_STATUS_CONFLICT' });
  });

  it('não altera uma tarefa de outra lista', async () => {
    const c = client({ updateTicketStatus: vi.fn().mockRejectedValue(new ClickUpTicketsError(404, 'CLICKUP_TASK_OUT_OF_SCOPE', 'private')) });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'review_spec' })).rejects.toMatchObject({ statusCode: 404, code: 'TICKET_NOT_FOUND' });
  });

  it('rejeita destino desconhecido ou igual sem ler a tarefa', async () => {
    const c = client();
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'desconhecido' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TICKET_STATUS' });
    await expect(new TicketService(c as any).updateTicketStatus('task-1', { expectedStatus: 'triagem', status: 'triagem' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TICKET_STATUS' });
    expect(c.updateTicketStatus).not.toHaveBeenCalled();
  });
});
