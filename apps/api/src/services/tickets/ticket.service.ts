import { captureServerEvent } from '../../lib/analytics.js';
import {
  ClickUpTicketsClient,
  ClickUpTicketsError,
  type ClickUpMember,
  type ClickUpTicketDetails,
  type ClickUpTicketStatus,
  type ClickUpTicketSummary,
  type CreatedClickUpTicket,
  type CreateClickUpTicketInput,
} from '../../lib/clickup-tickets.client.js';
import { AppError } from '../../middleware/errorHandler.js';

type SafeFailureReason = 'timeout' | 'unauthorized' | 'provider_unavailable' | 'invalid_response' | 'missing_config';

function toSafeFailureReason(error: ClickUpTicketsError): SafeFailureReason {
  switch (error.code) {
    case 'CLICKUP_UNAUTHORIZED': return 'unauthorized';
    case 'CLICKUP_TIMEOUT': return 'timeout';
    case 'CLICKUP_INVALID_RESPONSE': return 'invalid_response';
    case 'CLICKUP_MISSING_CONFIG': return 'missing_config';
    default: return 'provider_unavailable';
  }
}

/** Caso de uso de tickets: não conhece HTTP/Express nem segredos do ClickUp. */
export class TicketService {
  constructor(private readonly clickUpClient: Pick<ClickUpTicketsClient, 'createTicket' | 'listTickets' | 'listMembers' | 'listStatuses' | 'getTicket' | 'updateTicketStatus' | 'getConfiguredListId'>) {}

  async createTicket(input: CreateClickUpTicketInput): Promise<CreatedClickUpTicket> {
    try {
      return await this.clickUpClient.createTicket(input);
    } catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_ATTACHMENT_FAILED' && error.clickupTaskUrl) {
        captureServerEvent('ticket_clickup_attachment_failed', { reason });
        throw new AppError(502, 'TICKET_ATTACHMENTS_UNAVAILABLE', 'O ticket foi aberto, mas não foi possível anexar todos os arquivos.', { clickupTaskUrl: error.clickupTaskUrl });
      }
      captureServerEvent('ticket_clickup_creation_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível abrir o ticket agora. Tente novamente.');
    }
  }

  async listTickets(): Promise<{
    data: { open: ClickUpTicketSummary[]; resolved: ClickUpTicketSummary[] };
    partial_failures: Array<{ provider: 'clickup'; reason: SafeFailureReason }>;
  }> {
    try {
      const tickets = await this.clickUpClient.listTickets();
      const open: ClickUpTicketSummary[] = [];
      const resolved: ClickUpTicketSummary[] = [];
      for (const ticket of tickets) {
        if (ticket.status === 'concluído' || ticket.statusType === 'closed') resolved.push(ticket);
        else open.push(ticket);
      }
      return { data: { open, resolved }, partial_failures: [] };
    } catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_list_failed', { reason });
      return { data: { open: [], resolved: [] }, partial_failures: [{ provider: 'clickup', reason }] };
    }
  }

  async listAssignees(): Promise<ClickUpMember[]> {
    try {
      return await this.clickUpClient.listMembers();
    } catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_assignees_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível carregar os responsáveis agora.');
    }
  }

  async listStatuses(): Promise<ClickUpTicketStatus[]> {
    try {
      const statuses = await this.clickUpClient.listStatuses();
      if (statuses.length === 0) throw new Error('empty status list');
      return statuses;
    } catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_statuses_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível carregar os status agora.');
    }
  }

  async updateTicketStatus(ticketId: string, input: { expectedStatus: string; status: string }): Promise<ClickUpTicketDetails> {
    try {
      const statuses = await this.clickUpClient.listStatuses();
      const destination = statuses.find((status) => status.name === input.status);
      if (!destination || input.status === input.expectedStatus) {
        throw new AppError(400, 'INVALID_TICKET_STATUS', 'Escolha um status diferente e válido.');
      }

      const ticket = await this.clickUpClient.getTicket(ticketId);
      if (ticket.listId !== this.clickUpClient.getConfiguredListId()) {
        throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket não encontrado.');
      }
      if (ticket.status !== input.expectedStatus) {
        throw new AppError(409, 'TICKET_STATUS_CONFLICT', 'O status deste ticket mudou. Atualize a lista e tente novamente.');
      }
      return await this.clickUpClient.updateTicketStatus(ticketId, input.status);
    } catch (error) {
      if (error instanceof AppError) throw error;
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_status_update_failed', { reason });
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_TICKET_NOT_FOUND') {
        throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket não encontrado.');
      }
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível alterar o status agora. Atualize a lista antes de tentar novamente.');
    }
  }
}
