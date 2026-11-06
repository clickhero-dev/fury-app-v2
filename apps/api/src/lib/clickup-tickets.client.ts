import { externalFetch, ExternalHttpError } from './http-client.js';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
export const TICKET_SCOPE_LABELS = ['app', 'ux', 'infra', 'api', 'dados', 'integracoes', 'seguranca'] as const;
export const TICKET_AREA_LABELS = ['meta', 'sincronizacao-dados', 'dados-usuario', 'google'] as const;
export const TICKET_LABELS = [...TICKET_SCOPE_LABELS, ...TICKET_AREA_LABELS] as const;
export type TicketLabel = (typeof TICKET_LABELS)[number];

export interface CreateClickUpTicketInput {
  email: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  level: TicketLevel;
  labels?: TicketLabel[];
  assigneeId?: number;
  attachments?: TicketAttachment[];
}

export interface TicketAttachment {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface CreatedClickUpTicket {
  clickupTaskId: string;
  clickupTaskUrl: string;
}

export type ReviewClickUpTicketInput =
  | { decision: 'approve' }
  | { decision: 'reject'; reason: string };

export interface ClickUpTicketSummary {
  id: string;
  name: string;
  status: string;
  statusType: string;
  priority: TicketPriority | null;
  url: string;
  createdAt: string;
  labels: TicketLabel[];
}

export interface ClickUpTicketStatus {
  name: string;
  type: string;
}

export interface ClickUpTicketDetails {
  id: string;
  status: string;
  statusType: string;
  listId: string;
}

export interface ClickUpMember {
  id: number;
  name: string;
  email: string | null;
}

export class ClickUpTicketsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'CLICKUP_MISSING_CONFIG' | 'CLICKUP_UNAVAILABLE' | 'CLICKUP_TIMEOUT' | 'CLICKUP_UNAUTHORIZED' | 'CLICKUP_INVALID_RESPONSE' | 'CLICKUP_TICKET_NOT_FOUND' | 'CLICKUP_ATTACHMENT_FAILED' | 'CLICKUP_REVIEW_CONFLICT',
    message: string,
    public readonly clickupTaskUrl?: string,
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface ClickUpTicketsConfig {
  apiToken: string;
  listId: string;
}

export function getClickUpTicketsConfig(): ClickUpTicketsConfig {
  const apiToken = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_TICKETS_LIST_ID;
  if (!apiToken || !listId) {
    throw new ClickUpTicketsError(500, 'CLICKUP_MISSING_CONFIG', 'Integração de tickets não configurada.');
  }
  return { apiToken, listId };
}

const clickUpPriority: Record<TicketPriority, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

function toClickUpDescription(input: CreateClickUpTicketInput): string {
  return [
    '## Ticket aberto pelo painel Ady',
    '',
    `- **E-mail do usuário:** ${input.email}`,
    `- **Nível:** ${input.level}`,
    `- **Prioridade:** ${input.priority}`,
    '',
    '## Descrição',
    input.description,
  ].join('\n');
}

/** Adaptador do ClickUp para abertura de tickets — sem dependência de Express. */
export class ClickUpTicketsClient {
  constructor(private readonly config?: ClickUpTicketsConfig) {}

  private resolveConfig(): ClickUpTicketsConfig {
    return this.config ?? getClickUpTicketsConfig();
  }

  getConfiguredListId(): string {
    return this.resolveConfig().listId;
  }

  private async getJson(path: string): Promise<unknown> {
    const { apiToken } = this.resolveConfig();
    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}${path}`, {
        headers: { Authorization: apiToken },
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        const code = error.code === 'TIMEOUT' ? 'CLICKUP_TIMEOUT' : 'CLICKUP_UNAVAILABLE';
        throw new ClickUpTicketsError(502, code, 'Não foi possível consultar o ClickUp agora.');
      }
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'Não foi possível consultar o ClickUp agora.');
    }
    if (!response.ok) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível consultar o ClickUp agora.');
    }
    return response.json().catch(() => {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
    });
  }

  private async requestTask(taskId: string, method: 'GET' | 'PUT', body?: Record<string, string>): Promise<ClickUpTicketDetails> {
    const { apiToken } = this.resolveConfig();
    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}/task/${encodeURIComponent(taskId)}`, {
        method,
        headers: { Authorization: apiToken, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        const code = error.code === 'TIMEOUT' ? 'CLICKUP_TIMEOUT' : 'CLICKUP_UNAVAILABLE';
        throw new ClickUpTicketsError(502, code, 'Não foi possível consultar o ClickUp agora.');
      }
      throw error;
    }
    if (response.status === 404) throw new ClickUpTicketsError(404, 'CLICKUP_TICKET_NOT_FOUND', 'Ticket não encontrado.');
    if (response.status === 401 || response.status === 403) throw new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'Não foi possível consultar o ClickUp agora.');
    if (!response.ok) throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível consultar o ClickUp agora.');
    const payload = await response.json().catch(() => null) as {
      id?: unknown; status?: { status?: unknown; type?: unknown }; list?: { id?: unknown };
    } | null;
    if (typeof payload?.id !== 'string' || typeof payload.status?.status !== 'string' || typeof payload.status.type !== 'string' || typeof payload.list?.id !== 'string') {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
    }
    return { id: payload.id, status: payload.status.status, statusType: payload.status.type, listId: payload.list.id };
  }

  async listStatuses(): Promise<ClickUpTicketStatus[]> {
    const payload = await this.getJson(`/list/${this.resolveConfig().listId}`) as { statuses?: unknown };
    if (!Array.isArray(payload?.statuses) || payload.statuses.length === 0) {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma lista de status inválida.');
    }
    return payload.statuses.map((status) => {
      const item = status as { status?: unknown; type?: unknown };
      if (typeof item.status !== 'string' || !item.status.trim() || typeof item.type !== 'string' || !item.type.trim()) {
        throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma lista de status inválida.');
      }
      return { name: item.status, type: item.type };
    });
  }

  async getTicket(taskId: string): Promise<ClickUpTicketDetails> {
    return this.requestTask(taskId, 'GET');
  }

  async updateTicketStatus(taskId: string, status: string): Promise<ClickUpTicketDetails> {
    return this.requestTask(taskId, 'PUT', { status });
  }

  private async uploadAttachment(taskId: string, attachment: TicketAttachment): Promise<void> {
    const { apiToken } = this.resolveConfig();
    const form = new FormData();
    form.append('attachment', new Blob([new Uint8Array(attachment.buffer)], { type: attachment.mimeType }), attachment.filename);

    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}/task/${taskId}/attachment`, {
        method: 'POST',
        headers: { Authorization: apiToken },
        body: form,
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível anexar o arquivo ao ticket agora.');
      }
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'Não foi possível anexar o arquivo ao ticket agora.');
    }
    if (!response.ok) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível anexar o arquivo ao ticket agora.');
    }
  }

  async createTicket(input: CreateClickUpTicketInput): Promise<CreatedClickUpTicket> {
    const { apiToken, listId } = this.resolveConfig();
    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}/list/${listId}/task`, {
        method: 'POST',
        headers: {
          Authorization: apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `[${input.level}] ${input.subject}`,
          description: toClickUpDescription(input),
          priority: clickUpPriority[input.priority],
          status: 'pendente',
          ...(input.labels?.length ? { tags: input.labels } : {}),
          ...(input.assigneeId ? { assignees: [input.assigneeId] } : {}),
        }),
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível criar o ticket agora.');
      }
      throw error;
    }

    if (response.status === 401 || response.status === 403) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'Não foi possível criar o ticket agora.');
    }
    if (!response.ok) {
      throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível criar o ticket agora.');
    }

    const payload = await response.json().catch(() => null) as { id?: unknown; url?: unknown } | null;
    if (!payload || typeof payload.id !== 'string' || typeof payload.url !== 'string') {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'Não foi possível confirmar a criação do ticket.');
    }

    const ticket = { clickupTaskId: payload.id, clickupTaskUrl: payload.url };
    try {
      for (const attachment of input.attachments ?? []) {
        await this.uploadAttachment(ticket.clickupTaskId, attachment);
      }
    } catch (error) {
      if (error instanceof ClickUpTicketsError) {
        throw new ClickUpTicketsError(502, 'CLICKUP_ATTACHMENT_FAILED', 'Não foi possível anexar todos os arquivos ao ticket.', ticket.clickupTaskUrl);
      }
      throw error;
    }

    return ticket;
  }

  async listTickets(): Promise<ClickUpTicketSummary[]> {
    const { listId } = this.resolveConfig();
    const payload = await this.getJson(`/list/${listId}/task?include_closed=true`) as { tasks?: unknown };
    if (!Array.isArray(payload?.tasks)) {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
    }

    return payload.tasks.map((task): ClickUpTicketSummary => {
      const item = task as {
        id?: unknown; name?: unknown; url?: unknown; date_created?: unknown;
        status?: { status?: unknown; type?: unknown }; priority?: { priority?: unknown } | null;
        tags?: Array<{ name?: unknown }>;
      };
      if (
        typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.url !== 'string' ||
        typeof item.date_created !== 'string' || typeof item.status?.status !== 'string' || typeof item.status?.type !== 'string'
      ) {
        throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
      }
      const rawPriority = item.priority?.priority;
      const priority = rawPriority === 'low' || rawPriority === 'normal' || rawPriority === 'high' || rawPriority === 'urgent'
        ? rawPriority : null;
      const labels = Array.isArray(item.tags)
        ? item.tags.map((tag) => tag.name).filter((name): name is TicketLabel => typeof name === 'string' && (TICKET_LABELS as readonly string[]).includes(name))
        : [];
      return {
        id: item.id, name: item.name, url: item.url, status: item.status.status,
        statusType: item.status.type, priority,
        createdAt: new Date(Number(item.date_created)).toISOString(),
        labels,
      };
    });
  }

  async reviewTicket(taskId: string, input: ReviewClickUpTicketInput): Promise<{ status: string }> {
    const task = await this.getJson(`/task/${encodeURIComponent(taskId)}`) as {
      description?: unknown;
      status?: { status?: unknown };
    };
    if (typeof task.status?.status !== 'string' || task.status.status.trim().toLocaleLowerCase() !== 'homologação') {
      throw new ClickUpTicketsError(409, 'CLICKUP_REVIEW_CONFLICT', 'O chamado não está mais em homologação. Atualize a lista e tente novamente.');
    }
    if (input.decision === 'reject' && task.description != null && typeof task.description !== 'string') {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'Não foi possível atualizar a descrição do chamado.');
    }
    const status = input.decision === 'approve' ? 'Aprovado' : 'Implement';
    const currentDescription = typeof task.description === 'string' ? task.description.trimEnd() : '';
    const payload = input.decision === 'approve'
      ? { status }
      : { status, description: `${currentDescription ? `${currentDescription}\\n\\n` : ''}## Reprovação na homologação\\n${input.reason.trim()}` };
    const { apiToken } = this.resolveConfig();
    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}/task/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível atualizar o chamado no ClickUp agora.');
      throw error;
    }
    if (response.status === 401 || response.status === 403) throw new ClickUpTicketsError(502, 'CLICKUP_UNAUTHORIZED', 'Não foi possível atualizar o chamado no ClickUp agora.');
    if (!response.ok) throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível atualizar o chamado no ClickUp agora.');
    return { status };
  }

  async listMembers(): Promise<ClickUpMember[]> {
    const { listId } = this.resolveConfig();
    const membersPayload = await this.getJson(`/list/${listId}/member`) as { members?: unknown };
    if (!Array.isArray(membersPayload?.members)) {
      throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
    }

    return membersPayload.members.map((member): ClickUpMember => {
      const user = (member as { user?: unknown }).user ?? member;
      const item = user as { id?: unknown; username?: unknown; email?: unknown };
      if (typeof item.id !== 'number' || typeof item.username !== 'string' || (item.email !== null && typeof item.email !== 'string')) {
        throw new ClickUpTicketsError(502, 'CLICKUP_INVALID_RESPONSE', 'O ClickUp retornou uma resposta inválida.');
      }
      return { id: item.id, name: item.username, email: item.email ?? null };
    });
  }
}
