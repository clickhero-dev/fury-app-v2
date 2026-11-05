import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { BusinessProfileForm } from './BusinessProfileForm';
import type { GoogleBusinessSettings } from '@/types/google';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPut = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: {
    get: mockApiGet,
    post: vi.fn(),
    put: mockApiPut,
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const SETTINGS: GoogleBusinessSettings = {
  name: 'Padaria do Bairro',
  address: { street: 'Rua das Flores, 100', city: 'São Paulo', state: 'SP', postalCode: '01000-000', country: 'BR' },
  phone: '+55 11 99999-9999',
  email: 'contato@padaria.com.br',
  website: 'https://padaria.com.br',
  categoryId: null,
  categoryDisplayName: null,
  hours: null,
  prefilledFrom: [],
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('BusinessProfileForm — campos obrigatórios e payload', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockApiGet.mockResolvedValue({ data: { success: true, data: SETTINGS } });
  });

  it('marca os campos obrigatórios (nome, telefone, endereço) como requeridos', async () => {
    render(<BusinessProfileForm />, { wrapper: makeWrapper() });

    await screen.findByDisplayValue('Padaria do Bairro');

    const nomeLabel = screen.getByText('Nome do negócio');
    const telefoneLabel = screen.getByText('Telefone');
    const enderecoLabel = screen.getByText('Endereço');

    // O asterisco de obrigatório é renderizado via pseudo-elemento CSS (after:content-["*"])
    // quando o campo é required — verificamos a classe que o habilita.
    expect(nomeLabel.className).toContain('after:');
    expect(telefoneLabel.className).toContain('after:');
    expect(enderecoLabel.className).toContain('after:');
  });

  it('bloqueia o envio e exibe erros quando obrigatórios faltam', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        success: true,
        data: { ...SETTINGS, name: '', address: { ...SETTINGS.address, street: '', city: '' }, phone: '' },
      },
    });

    render(<BusinessProfileForm />, { wrapper: makeWrapper() });

    await screen.findByText('Dados do negócio');
    const submit = screen.getByRole('button', { name: /Salvar dados do negócio/i });
    await userEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText('Nome do negócio é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Telefone é obrigatório.')).toBeInTheDocument();
      expect(screen.getByText('Informe ao menos a rua ou a cidade do endereço.')).toBeInTheDocument();
    });
    expect(mockApiPut).not.toHaveBeenCalled();
  });

  it('envia payload completo com country BR quando os obrigatórios estão preenchidos', async () => {
    mockApiPut.mockResolvedValue({ data: { success: true, data: SETTINGS } });

    render(<BusinessProfileForm />, { wrapper: makeWrapper() });

    await screen.findByDisplayValue('Padaria do Bairro');
    const submit = screen.getByRole('button', { name: /Salvar dados do negócio/i });
    await userEvent.click(submit);

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut).toHaveBeenCalledWith('/google/settings', {
      name: 'Padaria do Bairro',
      address: { street: 'Rua das Flores, 100', city: 'São Paulo', state: 'SP', postalCode: '01000-000', country: 'BR' },
      phone: '+55 11 99999-9999',
      email: 'contato@padaria.com.br',
      website: 'https://padaria.com.br',
      categoryId: null,
      hours: null,
    });
  });

  it('explicita endereço obrigatório quando falta rua E cidade (mensagem clara)', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        success: true,
        data: { ...SETTINGS, address: { ...SETTINGS.address, street: '', city: '' } },
      },
    });

    render(<BusinessProfileForm />, { wrapper: makeWrapper() });

    await screen.findByText('Dados do negócio');
    const submit = screen.getByRole('button', { name: /Salvar dados do negócio/i });
    await userEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByText('Informe ao menos a rua ou a cidade do endereço.')).toBeInTheDocument()
    );
  });
});