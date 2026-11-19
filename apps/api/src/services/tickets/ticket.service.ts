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
  type ReviewClickUpTicketInput,
} from '../../lib/clickup-tickets.client.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { SupportTicketRepository } from '../../repository/support-ticket.repository.js';

// chamados do sistema: nome começa com [N1]–[N5]
const TICKET_NAME_RE = /^\s*\[N[1-5]\]/i;
const TICKETS_SYNC_MS = 60 * 60 * 1000;

type SafeFailureReason = 'timeout' | 'unauthorized' | 'provider_unavailable' | 'invalid_response' | 'missing_config' | 'too_many_tickets';

function toSafeFailureReason(error: ClickUpTicketsError): SafeFailureReason {
  switch (error.code) {
    case 'CLICKUP_UNAUTHORIZED': return 'unauthorized';
    case 'CLICKUP_TIMEOUT': return 'timeout';
    case 'CLICKUP_INVALID_RESPONSE': return 'invalid_response';
    case 'CLICKUP_MISSING_CONFIG': return 'missing_config';
    case 'CLICKUP_TOO_MANY_TICKETS': return 'too_many_tickets';
    default: return 'provider_unavailable';
  }
}

/** Caso de uso de tickets: não conhece HTTP/Express nem segredos do ClickUp. */
export class TicketService {
  constructor(
    private readonly clickUpClient: Pick<ClickUpTicketsClient, 'createTicket' | 'listTickets' | 'listMembers' | 'listStatuses' | 'updateTicketStatus' | 'reviewTicket'>,
    private readonly store: Pick<SupportTicketRepository, 'read' | 'replaceAll'> | null = null,
  ) {}

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

  // lê a cópia do banco; busca no ClickUp se pedirem ou se tiver mais de 1 hora
  async listTickets(options: { refresh?: boolean } = {}, now = new Date()): Promise<{
    data: { open: ClickUpTicketSummary[]; resolved: ClickUpTicketSummary[] };
    syncedAt: string | null;
    partial_failures: Array<{ provider: 'clickup'; reason: SafeFailureReason }>;
  }> {
    const stored = this.store ? await this.store.read() : { tickets: [], syncedAt: null };
    let tickets = stored.tickets;
    let syncedAt = stored.syncedAt;
    const partial_failures: Array<{ provider: 'clickup'; reason: SafeFailureReason }> = [];
    const stale = !this.store || options.refresh || !syncedAt || now.getTime() - syncedAt.getTime() >= TICKETS_SYNC_MS;
    if (stale) {
      try {
        tickets = (await this.clickUpClient.listTickets()).filter((t) => TICKET_NAME_RE.test(t.name));
        syncedAt = now;
        await this.store?.replaceAll(tickets, now);
      } catch (error) {
        const reason = error instanceof ClickUpTicketsError ? toSafeFailureReason(error) : 'provider_unavailable';
        captureServerEvent('ticket_clickup_list_failed', { reason });
        // ClickUp fora: segue com a cópia guardada
        tickets = stored.tickets;
        syncedAt = stored.syncedAt;
        partial_failures.push({ provider: 'clickup', reason });
      }
    }
    const open: ClickUpTicketSummary[] = [];
    const resolved: ClickUpTicketSummary[] = [];
    for (const ticket of tickets) {
      if (ticket.status === 'concluído' || ticket.statusType === 'closed') resolved.push(ticket);
      else open.push(ticket);
    }
    return { data: { open, resolved }, syncedAt: syncedAt?.toISOString() ?? null, partial_failures };
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
