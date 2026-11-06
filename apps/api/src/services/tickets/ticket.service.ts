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
  constructor(private readonly clickUpClient: Pick<ClickUpTicketsClient, 'createTicket' | 'listTickets' | 'listMembers' | 'listStatuses' | 'updateTicketStatus'>) {}

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
      return await this.clickUpClient.listStatuses();
    } catch (error) {
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_statuses_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível carregar os status agora. Tente novamente.');
    }
  }

  async updateTicketStatus(ticketId: string, input: { expectedStatus: string; status: string }): Promise<ClickUpTicketDetails> {
    if (input.expectedStatus.trim().toLocaleLowerCase() === input.status.trim().toLocaleLowerCase()) {
      throw new AppError(400, 'INVALID_TICKET_STATUS', 'Escolha um status diferente do atual.');
    }

    const statuses = await this.listStatuses();
    const destination = statuses.find((option) => option.value.trim().toLocaleLowerCase() === input.status.trim().toLocaleLowerCase());
    if (!destination) {
      throw new AppError(400, 'INVALID_TICKET_STATUS', 'Escolha um status disponível na lista de chamados.');
    }

    try {
      return await this.clickUpClient.updateTicketStatus(ticketId, input.expectedStatus, destination.value);
    } catch (error) {
      if (error instanceof ClickUpTicketsError) {
        if (error.code === 'CLICKUP_STATUS_CONFLICT') {
          captureServerEvent('ticket_clickup_status_conflict', {});
          throw new AppError(409, 'TICKET_STATUS_CONFLICT', 'O status do ticket mudou no ClickUp. Recarregue os chamados antes de tentar novamente.');
        }
        if (error.code === 'CLICKUP_TASK_NOT_FOUND' || error.code === 'CLICKUP_TASK_OUT_OF_SCOPE') {
          throw new AppError(404, 'TICKET_NOT_FOUND', 'O ticket não foi encontrado na lista de chamados.');
        }
      }
      const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
      captureServerEvent('ticket_clickup_status_update_failed', { reason });
      throw new AppError(502, 'TICKET_PROVIDER_UNAVAILABLE', 'Não foi possível atualizar o status agora. Tente novamente.');
    }
  }
}
