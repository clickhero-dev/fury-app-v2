import { captureServerEvent } from '../../lib/analytics.js';
import {
  ClickUpTicketsClient,
  ClickUpTicketsError,
  type ClickUpMember,
  type ClickUpStatusOption,
  type ClickUpTicketSummary,
  type UpdatedClickUpTicket,
  type CreatedClickUpTicket,
  type CreateClickUpTicketInput,
  type ReviewClickUpTicketInput,
} from '../../lib/clickup-tickets.client.js';
import { AppError } from '../../middleware/errorHandler.js';

type SafeFailureReason = 'timeout' | 'unauthorized' | 'provider_unavailable' | 'invalid_response' | 'missing_config';

function toSafeFailureReason(error: ClickUpTicketsError): SafeFailureReason {
  switch (error.code) {
    case 'CLICKUP_UNAUTHORIZED': return 'unauthorized';
    case 'CLICKUP_INVALID_RESPONSE': return 'invalid_response';
    case 'CLICKUP_MISSING_CONFIG': return 'missing_config';
    case 'CLICKUP_TIMEOUT': return 'timeout';
    default: return 'provider_unavailable';
  }
}

/** Caso de uso de tickets: não conhece HTTP/Express nem segredos do ClickUp. */
export class TicketService {
  constructor(private readonly clickUpClient: Pick<ClickUpTicketsClient, 'createTicket' | 'listTickets' | 'listMembers' | 'reviewTicket' | 'listStatuses' | 'updateTicketStatus'>) {}

  async listStatuses(): Promise<ClickUpStatusOption[]> {
    try { return await this.clickUpClient.listStatuses(); }
    catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_statuses_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível carregar os status agora.');
    }
  }

  async updateTicketStatus(taskId: string, input: { expectedStatus: string; status: string }): Promise<UpdatedClickUpTicket> {
    try { return await this.clickUpClient.updateTicketStatus(taskId, input); }
    catch (error) {
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_INVALID_STATUS') throw new AppError(400, 'INVALID_TICKET_STATUS', error.message);
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_CONFLICT') throw new AppError(409, 'TICKET_STATUS_CONFLICT', 'O status do ticket mudou. Recarregue a lista e tente novamente.');
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_NOT_FOUND') throw new AppError(404, 'TICKET_NOT_FOUND', 'Ticket não encontrado na lista de tickets.');
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_status_update_failed', { reason });
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_TIMEOUT') throw new AppError(504, 'TICKET_STATUS_UPDATE_UNKNOWN', 'Não foi possível confirmar a alteração. Recarregue a lista antes de tentar novamente.');
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível alterar o status agora. Tente novamente.');
    }
  }

  async reviewTicket(taskId: string, input: ReviewClickUpTicketInput): Promise<{ status: string }> {
    try {
      return await this.clickUpClient.reviewTicket(taskId, input);
    } catch (error) {
      if (error instanceof ClickUpTicketsError && error.code === 'CLICKUP_REVIEW_CONFLICT') {
        throw new AppError(409, 'TICKET_REVIEW_CONFLICT', error.message);
      }
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_review_failed', { reason });
      throw new AppError(502, 'TICKET_REVIEW_UNAVAILABLE', 'Não foi possível atualizar o chamado agora. Tente novamente.');
    }
  }

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
}
