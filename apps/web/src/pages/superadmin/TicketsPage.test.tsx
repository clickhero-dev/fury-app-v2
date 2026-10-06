/*
Funcionalidade: abrir ticket de suporte pelo painel administrativo

  Cenário: abrir ticket com dados válidos
    Dado que o superadmin preenche o formulário
    Quando envia o ticket
    Então vê a confirmação e o link da tarefa no ClickUp

  Cenário: impedir e-mail inválido
    Dado que o e-mail não é válido
    Quando tenta enviar o formulário
    Então a API não é chamada e o erro é informado

  Cenário: manter o preenchimento após erro do serviço
    Dado que o ClickUp está indisponível
    Quando o superadmin envia o ticket
    Então vê uma mensagem segura e seus dados continuam no formulário
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketsPage } from './TicketsPage';

const mockPost = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { post: mockPost, get: mockGet } }));

function mockTicketsData() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/admin/tickets') return Promise.resolve({ data: { data: {
      open: [{ id: 'open-1', name: '[N2] Publicação falhou', status: 'em progresso', priority: 'high', url: 'https://app.clickup.com/t/open-1', createdAt: '2026-10-06T00:00:00.000Z' }],
      resolved: [{ id: 'done-1', name: '[N1] Dúvida resolvida', status: 'concluído', priority: 'normal', url: 'https://app.clickup.com/t/done-1', createdAt: '2026-10-05T00:00:00.000Z' }],
    }, partial_failures: [] } });
    if (url === '/admin/tickets/assignees') return Promise.resolve({ data: { data: [{ id: 101281834, name: 'Kaio Araújo', email: 'kaio@clickhero.com.br' }] } });
    return Promise.reject(new Error(`Unexpected URL ${url}`));
  });
}

async function fillValidForm(user = userEvent.setup()) {
  await user.type(screen.getByLabelText('E-mail do usuário'), 'cliente@empresa.com');
  await user.type(screen.getByLabelText('Assunto'), 'Erro ao publicar campanha');
  await user.type(screen.getByLabelText('Descrição'), 'A publicação falha depois de confirmar os dados.');
  await user.selectOptions(screen.getByLabelText('Prioridade'), 'high');
  await user.selectOptions(screen.getByLabelText('Nível'), 'N2');
  await screen.findByRole('option', { name: 'Kaio Araújo' });
  await user.selectOptions(screen.getByLabelText('Responsável'), '101281834');
  return user;
}

describe('TicketsPage', () => {
  beforeEach(() => { mockPost.mockReset(); mockGet.mockReset(); mockTicketsData(); });

  it('envia ticket válido e exibe link do ClickUp', async () => {
    mockPost.mockResolvedValue({ data: { data: { clickupTaskId: 'task-123', clickupTaskUrl: 'https://app.clickup.com/t/task-123' } } });
    render(<TicketsPage />);
    const user = await fillValidForm();

    await user.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/admin/tickets', {
      email: 'cliente@empresa.com', subject: 'Erro ao publicar campanha',
      description: 'A publicação falha depois de confirmar os dados.', priority: 'high', level: 'N2', assigneeId: 101281834,
    }));
    expect(await screen.findByRole('link', { name: 'Abrir ticket no ClickUp' })).toHaveAttribute('href', 'https://app.clickup.com/t/task-123');
  });

  it('não envia quando o e-mail é inválido', async () => {
    render(<TicketsPage />);
    fireEvent.change(screen.getByLabelText('E-mail do usuário'), { target: { value: 'email-inválido' } });
    fireEvent.change(screen.getByLabelText('Assunto'), { target: { value: 'Assunto válido' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição detalhada para abrir o chamado.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('mantém os campos e mostra mensagem segura quando a API falha', async () => {
    mockPost.mockResolvedValue({
      data: { error: { message: 'Não foi possível abrir o ticket agora. Tente novamente.' } },
    });
    render(<TicketsPage />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: 'Abrir ticket' }));

    expect(await screen.findByText('Não foi possível abrir o ticket agora. Tente novamente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Assunto')).toHaveValue('Erro ao publicar campanha');
    expect(screen.getByLabelText('Nível')).toHaveValue('N2');
  });

  it('mostra abertos, resolvidos, ajuda de níveis e links ClickUp', async () => {
    render(<TicketsPage />);

    expect(await screen.findByText('Abertos (1)')).toBeInTheDocument();
    expect(screen.getByText('Resolvidos (1)')).toBeInTheDocument();
    expect(screen.getByText('[N2] Publicação falhou')).toBeInTheDocument();
    expect(screen.getByText('[N1] Dúvida resolvida')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver no ClickUp: [N2] Publicação falhou' })).toHaveAttribute('href', 'https://app.clickup.com/t/open-1');
    expect(screen.getByText('N1 — Orientação simples')).toBeInTheDocument();
    expect(screen.getByText('N4 — Crítico')).toBeInTheDocument();
  });
});
