import { externalFetch, ExternalHttpError } from './http-client.js';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketLevel = 'N1' | 'N2' | 'N3' | 'N4';

export interface CreateClickUpTicketInput {
  email: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  level: TicketLevel;
  assigneeId?: number;
}

export interface CreatedClickUpTicket {
  clickupTaskId: string;
  clickupTaskUrl: string;
}

export interface ClickUpTicketSummary {
  id: string;
  name: string;
  status: string;
  statusType: string;
  priority: TicketPriority | null;
  url: string;
  createdAt: string;
}

export interface ClickUpMember {
  id: number;
  name: string;
  email: string | null;
}

export class ClickUpTicketsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: 'CLICKUP_MISSING_CONFIG' | 'CLICKUP_UNAVAILABLE' | 'CLICKUP_UNAUTHORIZED' | 'CLICKUP_INVALID_RESPONSE',
    message: string,
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

  private async getJson(path: string): Promise<unknown> {
    const { apiToken } = this.resolveConfig();
    let response: Response;
    try {
      response = await externalFetch(`${CLICKUP_API_URL}${path}`, {
        headers: { Authorization: apiToken },
      });
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        throw new ClickUpTicketsError(502, 'CLICKUP_UNAVAILABLE', 'Não foi possível consultar o ClickUp agora.');
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

    return { clickupTaskId: payload.id, clickupTaskUrl: payload.url };
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
      return {
        id: item.id, name: item.name, url: item.url, status: item.status.status,
        statusType: item.status.type, priority,
        createdAt: new Date(Number(item.date_created)).toISOString(),
      };
    });
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
