import { captureServerEvent } from '../../lib/analytics.js';
import {
  ClickUpTicketsClient,
  ClickUpTicketsError,
  type ClickUpMember,
  type ClickUpTicketSummary,
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
    default: return 'provider_unavailable';
  }
}

/** Caso de uso de tickets: não conhece HTTP/Express nem segredos do ClickUp. */
export class TicketService {
  constructor(private readonly clickUpClient: Pick<ClickUpTicketsClient, 'createTicket' | 'listTickets' | 'listMembers' | 'reviewTicket'>) {}

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
