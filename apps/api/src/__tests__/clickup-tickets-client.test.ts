/**
 * Funcionalidade: criar chamados no ClickUp
 *
 * Cenário: envia os dados do chamado para a lista de triagem
 * Dado que o ClickUp está configurado
 * Quando um chamado N1 prioritário é criado
 * Então a tarefa é criada na lista Chamados com os metadados rastreáveis
 *
 * Cenário: o ClickUp está indisponível
 * Dado que a chamada ao ClickUp falha ou retorna conteúdo inválido
 * Quando o sistema tenta criar um chamado
 * Então recebe um erro normalizado e seguro
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClickUpTicketsClient, ClickUpTicketsError } from '../lib/clickup-tickets.client.js';

const savedEnv = { ...process.env };

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ClickUpTicketsClient', () => {
  beforeEach(() => {
    process.env.CLICKUP_API_TOKEN = 'clickup-secret-token';
    process.env.CLICKUP_TICKETS_LIST_ID = '901717485435';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.unstubAllGlobals();
  });

  it('cria a tarefa na lista Chamados com e-mail, nível e prioridade', async () => {
    const fetchMock = mockFetchOnce(200, {
      id: 'task-123',
      url: 'https://app.clickup.com/t/task-123',
    });
    const client = new ClickUpTicketsClient();

    await expect(client.createTicket({
      email: 'cliente@empresa.com',
      subject: 'Erro ao publicar campanha',
      description: 'A publicação falha depois de confirmar os dados.',
      priority: 'high',
      level: 'N1',
      assigneeId: 101281834,
    })).resolves.toEqual({
      clickupTaskId: 'task-123',
      clickupTaskUrl: 'https://app.clickup.com/t/task-123',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.clickup.com/api/v2/list/901717485435/task');
    expect((init as RequestInit).method).toBe('POST');
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('clickup-secret-token');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: '[N1] Erro ao publicar campanha',
      description: expect.stringContaining('cliente@empresa.com'),
      priority: 2,
      status: 'pendente',
      assignees: [101281834],
    });
  });

  it('normaliza falha de rede sem expor detalhes do provedor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('token=clickup-secret-token ECONNREFUSED')));
    const error = await new ClickUpTicketsClient().createTicket({
      email: 'cliente@empresa.com', subject: 'Assunto válido',
      description: 'Descrição detalhada para abrir o chamado.', priority: 'normal', level: 'N2',
    }).catch((err) => err);

    expect(error).toBeInstanceOf(ClickUpTicketsError);
    expect(error).toMatchObject({ status: 502, code: 'CLICKUP_UNAVAILABLE' });
    expect(error.message).not.toContain('clickup-secret-token');
  });

  it('rejeita resposta de sucesso sem id ou URL da tarefa', async () => {
    mockFetchOnce(200, { id: 'task-123' });
    const error = await new ClickUpTicketsClient().createTicket({
      email: 'cliente@empresa.com', subject: 'Assunto válido',
      description: 'Descrição detalhada para abrir o chamado.', priority: 'low', level: 'N4',
    }).catch((err) => err);

    expect(error).toMatchObject({ status: 502, code: 'CLICKUP_INVALID_RESPONSE' });
  });

  it('lista e normaliza tickets fechados e abertos da lista Chamados', async () => {
    const fetchMock = mockFetchOnce(200, {
      tasks: [{
        id: 'task-1', name: '[N1] Publicação falhou',
        status: { status: 'pendente', type: 'open' },
        priority: { priority: 'high' },
        url: 'https://app.clickup.com/t/task-1', date_created: '1791246447809',
      }],
    });

    await expect(new ClickUpTicketsClient().listTickets()).resolves.toEqual([{
      id: 'task-1', name: '[N1] Publicação falhou', status: 'pendente',
      statusType: 'open', priority: 'high', url: 'https://app.clickup.com/t/task-1',
      createdAt: '2026-10-06T00:27:27.809Z',
    }]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.clickup.com/api/v2/list/901717485435/task?include_closed=true');
  });

  it('lista membros disponíveis no workspace ClickUp', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ members: [{ user: { id: 101281834, username: 'Kaio Araújo', email: 'kaio@clickhero.com.br' } }] }) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ClickUpTicketsClient().listMembers()).resolves.toEqual([{
      id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br',
    }]);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.clickup.com/api/v2/list/901717485435/member');
  });
});
