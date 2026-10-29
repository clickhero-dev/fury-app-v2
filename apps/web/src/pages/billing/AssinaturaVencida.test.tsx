import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssinaturaVencida } from './AssinaturaVencida';
import type { Subscription } from '@/types/billing';

/*
Funcionalidade: recuperação de acesso na tela de assinatura vencida
Cenário: pessoa já possui assinatura válida
Dado que a pessoa autenticada abre /assinatura-vencida
Quando a consulta retorna assinatura válida
Então ela deve chegar a /dashboard sem permanecer na tela vencida
Cenário: existe assinatura ativa antiga no cache, mas o estado atual está vencido
Dado que a consulta compartilhada guarda uma assinatura ativa ainda considerada fresca
Quando a pessoa abre /assinatura-vencida e a API retorna assinatura vencida
Então a tela não deve liberar acesso com base somente no valor antigo em cache
Cenário: renovação identificada durante a espera
Dado que a assinatura está vencida na tela
Quando a consulta periódica retorna assinatura válida
Então a confirmação de acesso liberado aparece antes do destino /dashboard
Cenário: assinatura permanece vencida
Dado que a pessoa está na tela vencida
Quando o intervalo de 60 segundos ocorre e o status continua vencido
Então a tela permanece e uma nova consulta é realizada
Cenário: falha temporária de consulta
Dado que a pessoa está na tela vencida
Quando a consulta falha
Então a tela permanece com mensagem simples e tenta novamente no próximo ciclo
*/
const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockApiGet } }));

const active: Subscription = {
  id: 's1', tenantId: 't1', planId: 'p1', status: 'active', isNonExpirable: false,
  trialEndsAt: null, currentPeriodEnd: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  plan: null, invoices: [],
};
const expired: Subscription = { ...active, status: 'past_due', currentPeriodEnd: '2020-01-01T00:00:00.000Z' };

function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/assinatura-vencida']}>
    <Routes><Route path="/assinatura-vencida" element={<AssinaturaVencida />} /><Route path="/dashboard" element={<p>Início do Ady</p>} /></Routes>
    <Location />
  </MemoryRouter></QueryClientProvider>);
}
async function flushQueryUpdates() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
  });
}

beforeEach(() => { vi.useFakeTimers(); mockApiGet.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('AssinaturaVencida — recuperação de acesso', () => {
  /* Funcionalidade: mostrar vencimento ao invés de redirecionamento em loop
   * Cenário: assinatura com data encerrada e marcação não expirável
   * Dado que a consulta retorna um período passado com a marcação antiga
   * Quando a pessoa acessa a tela de assinatura vencida
   * Então permanece na tela, sem mensagem de acesso liberado.
   */
  it('mostra a tela vencida mesmo com a marcação não expirável', async () => {
    mockApiGet.mockResolvedValue({ data: { data: { ...active, isNonExpirable: true, currentPeriodEnd: '2020-01-01T00:00:00Z' } } });
    renderPage();
    await flushQueryUpdates();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText('Assinatura Vencida')).toBeInTheDocument();
    expect(screen.queryByText('Acesso liberado. Redirecionando você…')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/assinatura-vencida');
  });
  it('leva ao dashboard quando a consulta inicial confirma assinatura válida', async () => {
    mockApiGet.mockResolvedValue({ data: { data: active } });
    renderPage();
    await flushQueryUpdates();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Acesso liberado. Redirecionando você…')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
    expect(screen.queryByText('Assinatura Vencida')).not.toBeInTheDocument();
  });

  it('não libera acesso usando assinatura ativa em cache antes da consulta atual', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['billing', 'subscription'], active);
    mockApiGet.mockResolvedValue({ data: { data: expired } });

    renderPage(client);
    await flushQueryUpdates();

    expect(screen.queryByText('Acesso liberado. Redirecionando você…')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/assinatura-vencida');
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('consulta novamente após 60 segundos, confirma renovação e direciona ao dashboard', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: expired } }).mockResolvedValueOnce({ data: { data: active } });
    renderPage();
    await flushQueryUpdates();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/assinatura-vencida');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await flushQueryUpdates();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Acesso liberado. Redirecionando você…')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('permanece na tela vencida quando o status continua expirado e repete a consulta no próximo ciclo', async () => {
    mockApiGet.mockResolvedValue({ data: { data: expired } });
    renderPage();
    await flushQueryUpdates();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByTestId('location')).toHaveTextContent('/assinatura-vencida');
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mockApiGet).toHaveBeenCalledTimes(3);
  });

  it('mantém a tela e informa indisponibilidade sem detalhes técnicos após falha temporária', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('internal secret')).mockResolvedValue({ data: { data: expired } });
    renderPage();
    await flushQueryUpdates();
    expect(screen.getByText('Não foi possível atualizar seu acesso agora. Tentaremos novamente em breve.')).toBeInTheDocument();
    expect(screen.queryByText(/internal secret/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/assinatura-vencida');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
