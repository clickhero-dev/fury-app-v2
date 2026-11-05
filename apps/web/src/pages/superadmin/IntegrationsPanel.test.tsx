/*
Funcionalidade: chave de IA do parceiro (Integrações)

Cenário: sem chave
  Então aparece o campo (tipo senha) e Salvar envia a chave

Cenário: com chave
  Então aparecem só os 4 últimos dígitos, Trocar e Remover

Cenário: chave recusada
  Então a mensagem do servidor aparece e o campo continua aberto
*/
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationsPanel } from './IntegrationsPanel';
import { PartnerConfigPage } from './PartnerConfigPage';

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockGet, put: mockPut, delete: mockDelete, patch: vi.fn() } }));

const URL = '/admin/my-partner/ai-key';
const partner = { id: 'p-1', name: 'Parceira Um', maxTenants: 10, usedTenants: 7, accountEmail: 'um@x.com', keyLast4: null };

beforeEach(() => vi.clearAllMocks());

describe('IntegrationsPanel', () => {
  it('sem chave: salva pelo campo de senha, sem mostrar a chave depois', async () => {
    mockGet.mockResolvedValue({ data: { data: { configured: false, last4: null } } });
    mockPut.mockResolvedValue({ data: { data: { configured: true, last4: 'wxyz' } } });
    render(<IntegrationsPanel url={URL} />);

    const input = await screen.findByLabelText('Nova chave');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.type(input, 'sk-or-v1-abcdwxyz');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mockPut).toHaveBeenCalledWith(URL, { key: 'sk-or-v1-abcdwxyz' });
    expect(await screen.findByText('Chave configurada: ••••wxyz')).toBeInTheDocument();
    expect(screen.queryByText(/sk-or-v1-abcdwxyz/)).toBeNull();
    expect(screen.queryByText(/OpenRouter/i)).toBeNull();
  });

  it('com chave: remover limpa', async () => {
    mockGet.mockResolvedValue({ data: { data: { configured: true, last4: '1234' } } });
    mockDelete.mockResolvedValue({ data: { data: { configured: false, last4: null } } });
    render(<IntegrationsPanel url={URL} />);

    expect(await screen.findByText('Chave configurada: ••••1234')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(mockDelete).toHaveBeenCalledWith(URL);
    expect(await screen.findByLabelText('Nova chave')).toBeInTheDocument();
  });

  it('chave recusada: mostra o motivo e mantém o campo', async () => {
    mockGet.mockResolvedValue({ data: { data: { configured: false, last4: null } } });
    mockPut.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { error: { message: 'Chave de IA inválida.' } } } }));
    render(<IntegrationsPanel url={URL} />);

    await userEvent.type(await screen.findByLabelText('Nova chave'), 'sk-or-v1-errada');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Chave de IA inválida.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova chave')).toBeInTheDocument();
  });

  it('aba Integrações do super: só mostra se existe chave, sem cadastrar', async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith('/ai-key') ? { configured: true, last4: '9876' } : partner } }),
    );
    render(
      <MemoryRouter initialEntries={['/admin/parceiros/p-1']}>
        <Routes><Route path="/admin/parceiros/:id" element={<PartnerConfigPage />} /></Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Integrações' }));
    expect(await screen.findByText(/Chave configurada: ••••9876/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/admin/partners/p-1/ai-key');
    expect(screen.queryByLabelText('Nova chave')).toBeNull();
    expect(screen.queryByRole('button', { name: /Trocar|Remover|Salvar/ })).toBeNull();
  });
});
