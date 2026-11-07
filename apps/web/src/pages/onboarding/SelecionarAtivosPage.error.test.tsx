/*
Funcionalidade: recuperação de conexão Meta na seleção de ativos
  Cenário: code 190 ao carregar Business Managers
    Dado que a API responde 401/META_TOKEN_EXPIRED
    Quando a pessoa abre a etapa de seleção
    Então vê orientação de reconexão, não vê lista vazia e não há retry automático
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import axios, { type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { SelecionarAtivosPage } from './SelecionarAtivosPage';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: getMock, post: vi.fn() } }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><SelecionarAtivosPage /></QueryClientProvider>);
}

describe('SelecionarAtivosPage — falhas de conexão Meta', () => {
  it('mostra reconexão em 190 sem renderizar estado vazio nem repetir a chamada', async () => {
    const error = new axios.AxiosError('request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401,
      data: { error: { code: 'META_TOKEN_EXPIRED', message: 'Token Meta inválido ou expirado.' } },
    } as unknown as AxiosResponse);
    getMock.mockRejectedValueOnce(error);

    renderPage();

    expect(await screen.findByText(/conexão com a Meta precisa de atenção/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reconectar meta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma business manager encontrada/i)).not.toBeInTheDocument();
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
  });
});
