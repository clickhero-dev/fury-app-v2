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
 *
 * Cenário: registrar etiquetas no ClickUp
 * Dado que o chamado possui escopo e áreas operacionais
 * Quando a tarefa é criada
 * Então as tags nativas recebem a classificação
 *
 * Cenário: anexar evidências ao ticket
 * Dado que o chamado tem imagens ou vídeos
 * Quando a tarefa é criada no ClickUp
 * Então cada arquivo é enviado como anexo da tarefa
 *
 * Cenário: falhar ao anexar evidência
 * Dado que a tarefa já foi criada e o ClickUp rejeita um anexo
 * Quando o sistema conclui a abertura
 * Então informa uma falha segura e preserva a URL da tarefa criada
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
      labels: ['app', 'meta', 'sincronizacao-dados'],
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
      tags: ['app', 'meta', 'sincronizacao-dados'],
    });
  });

  it('cria solicitação de feature N5 na lista Chamados existente', async () => {
    const fetchMock = mockFetchOnce(200, {
      id: 'feature-123',
      url: 'https://app.clickup.com/t/feature-123',
    });

    await new ClickUpTicketsClient().createTicket({
      email: 'cliente@empresa.com',
      subject: 'Exportar relatórios em CSV',
      description: 'Permitir exportar os dados do painel em formato CSV.',
      priority: 'normal',
      level: 'N5',
      labels: ['app'],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.clickup.com/api/v2/list/901717485435/task');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(expect.objectContaining({
      name: '[N5] Exportar relatórios em CSV',
      description: expect.stringContaining('**Nível:** N5'),
    }));
  });

  it('anexa imagens e vídeos à tarefa criada', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'task-123', url: 'https://app.clickup.com/t/task-123' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ClickUpTicketsClient().createTicket({
      email: 'cliente@empresa.com', subject: 'Erro com evidências',
      description: 'Descrição detalhada com evidências anexadas.', priority: 'high', level: 'N2', labels: ['app'],
      attachments: [
        { buffer: Buffer.from('imagem'), filename: 'erro.png', mimeType: 'image/png' },
        { buffer: Buffer.from('video'), filename: 'erro.mp4', mimeType: 'video/mp4' },
      ],
    })).resolves.toEqual({ clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' });

    expect(String(fetchMock.mock.calls[1][0])).toBe('https://api.clickup.com/api/v2/task/task-123/attachment');
    expect(String(fetchMock.mock.calls[2][0])).toBe('https://api.clickup.com/api/v2/task/task-123/attachment');
    const firstAttachment = (fetchMock.mock.calls[1][1] as RequestInit).body as FormData;
    const secondAttachment = (fetchMock.mock.calls[2][1] as RequestInit).body as FormData;
    expect(firstAttachment.get('attachment')).toMatchObject({ name: 'erro.png', type: 'image/png' });
    expect(secondAttachment.get('attachment')).toMatchObject({ name: 'erro.mp4', type: 'video/mp4' });
  });

  it('preserva a URL da tarefa quando um anexo falha', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'task-123', url: 'https://app.clickup.com/t/task-123' }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const error = await new ClickUpTicketsClient().createTicket({
      email: 'cliente@empresa.com', subject: 'Erro com evidência',
      description: 'Descrição detalhada com evidência anexa.', priority: 'high', level: 'N2', labels: ['app'],
      attachments: [{ buffer: Buffer.from('imagem'), filename: 'erro.png', mimeType: 'image/png' }],
    }).catch((reason) => reason);

    expect(error).toMatchObject({ code: 'CLICKUP_ATTACHMENT_FAILED', clickupTaskUrl: 'https://app.clickup.com/t/task-123' });
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
        tags: [{ name: 'app' }, { name: 'meta' }, { name: 'tag-externa' }],
        url: 'https://app.clickup.com/t/task-1', date_created: '1791246447809',
      }],
    });

    await expect(new ClickUpTicketsClient().listTickets()).resolves.toEqual([{
      id: 'task-1', name: '[N1] Publicação falhou', status: 'pendente',
      statusType: 'open', priority: 'high', url: 'https://app.clickup.com/t/task-1',
      createdAt: '2026-10-06T00:27:27.809Z',
      labels: ['app', 'meta'],
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
