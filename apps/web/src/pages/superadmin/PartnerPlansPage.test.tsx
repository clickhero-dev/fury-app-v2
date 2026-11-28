import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerPlansPage } from './PartnerPlansPage';

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post, patch } }));

const views = [
  { key: 'campaigns', description: 'Campanhas' },
  { key: 'leads', description: 'Clientes' },
  { key: 'studio', description: 'Estúdio' },
  { key: 'studio.video', description: 'Vídeo' },
  { key: 'calendar', description: 'Calendário' },
];
const ouro = { id: 'pl-1', name: 'Parceiro Ouro', priceCents: 249990, maxTenants: 5, isActive: true, blockedViews: ['calendar'], partnersCount: 2 };
const reply = (data: unknown) => ({ data: { data } });

function mockLoad(plans: unknown[]) {
  get.mockImplementation(async (url: string) => reply(url.endsWith('/views') ? views : plans));
}

const renderPage = () => render(<MemoryRouter><PartnerPlansPage /></MemoryRouter>);

describe('PartnerPlansPage', () => {
  afterEach(() => vi.clearAllMocks());

  it('lista os planos com preço, vagas, parceiros e telas fora', async () => {
    mockLoad([ouro]);
    renderPage();
    expect(await screen.findByText('Parceiro Ouro')).toBeTruthy();
    expect(screen.getByText('R$ 2.499,90')).toBeTruthy();
    expect(screen.getByText('Calendário')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('cria plano com preço em centavos e telas desligadas; filho segue o pai', async () => {
    mockLoad([]);
    post.mockResolvedValue(reply(ouro));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Novo plano/ }));
    const dialog = screen.getByRole('dialog', { name: 'Novo plano de parceiro' });
    fireEvent.change(within(dialog).getByPlaceholderText('Ex.: Parceiro Ouro'), { target: { value: 'Parceiro Ouro' } });
    fireEvent.change(within(dialog).getByPlaceholderText('2.499,90'), { target: { value: '2.499,90' } });

    fireEvent.click(within(dialog).getByRole('switch', { name: 'Estúdio' }));
    const video = within(dialog).getByRole('switch', { name: 'Vídeo' });
    expect(video).toBeDisabled();
    expect(video).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar plano' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partner-plans', {
      name: 'Parceiro Ouro', priceCents: 249990, maxTenants: 5, isActive: true, blockedViews: ['studio'],
    }));
    expect(await screen.findByText('Plano criado')).toBeTruthy();
  });

  it('Clientes fica debaixo de Campanhas e desliga junto', async () => {
    mockLoad([]);
    post.mockResolvedValue(reply(ouro));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Novo plano/ }));
    const dialog = screen.getByRole('dialog', { name: 'Novo plano de parceiro' });
    const clientes = within(dialog).getByRole('switch', { name: 'Clientes' });
    expect(clientes.parentElement?.querySelector('.pl-4')).toBeTruthy();
    expect(clientes).not.toBeDisabled();
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Campanhas' }));
    expect(clientes).toBeDisabled();
    expect(clientes).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByText('Bloqueado junto com Campanhas')).toBeTruthy();
    fireEvent.change(within(dialog).getByPlaceholderText('Ex.: Parceiro Ouro'), { target: { value: 'Prata' } });
    fireEvent.change(within(dialog).getByPlaceholderText('2.499,90'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar plano' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partner-plans', expect.objectContaining({ blockedViews: ['campaigns'] })));
  });

  it('editar avisa que vale só para parceiros novos e envia PATCH', async () => {
    mockLoad([ouro]);
    patch.mockResolvedValue(reply(ouro));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar plano de parceiro' });
    expect(within(dialog).getByText(/valem só para parceiros novos/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Calendário' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/partner-plans/pl-1', expect.objectContaining({ priceCents: 249990, blockedViews: [] })));
  });

  it('preço inválido não envia; erro da API aparece com o motivo', async () => {
    mockLoad([]);
    post.mockImplementation(async () => {
      throw Object.assign(new Error('409'), { isAxiosError: true, response: { status: 409, data: { error: { message: 'Já existe um plano de parceiro com este nome.' } } } });
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Novo plano/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Ex.: Parceiro Ouro'), { target: { value: 'Ouro' } });
    fireEvent.change(within(dialog).getByPlaceholderText('2.499,90'), { target: { value: 'abc' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar plano' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe o preço em reais');
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByPlaceholderText('2.499,90'), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar plano' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um plano de parceiro com este nome.');
  });

  it('vagas vazias não viram 0 sem aviso', async () => {
    mockLoad([]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Novo plano/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Ex.: Parceiro Ouro'), { target: { value: 'Ouro' } });
    fireEvent.change(within(dialog).getByPlaceholderText('2.499,90'), { target: { value: '100' } });
    fireEvent.change(within(dialog).getByLabelText('Vagas de clientes'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar plano' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Informe as vagas');
    expect(post).not.toHaveBeenCalled();
  });

  it('erro ao carregar mostra o motivo e tenta de novo', async () => {
    const fail = async () => {
      throw Object.assign(new Error('500'), { isAxiosError: true, response: { status: 500, data: { error: { message: 'Banco indisponível' } } } });
    };
    // 1ª carga (planos + telas) falha; a 2ª funciona
    mockLoad([]);
    get.mockImplementationOnce(fail).mockImplementationOnce(fail);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os planos de parceiro');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhum plano de parceiro cadastrado ainda.')).toBeTruthy();
  });
});
