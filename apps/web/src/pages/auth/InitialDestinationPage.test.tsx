/*
# Language: pt-BR
Funcionalidade: decisão do destino inicial
  Cenário: aguarda a assinatura antes de abrir o chat Trial
  Cenário: falha de consulta preserva o destino anterior
  Cenário: visitante sem sessão retorna ao login
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { InitialDestinationPage } from './InitialDestinationPage';
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get } }));
function Destination() { const location = useLocation(); return <div>{location.pathname}</div>; }
function renderEntry() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/inicio']}><Routes><Route path="/inicio" element={<InitialDestinationPage />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { cleanup(); localStorage.clear(); get.mockReset(); });
describe('destino inicial', () => {
  it('aguarda a resposta e abre o chat', async () => {
    localStorage.setItem('token', 'sessao');
    let resolve!: (value: unknown) => void;
    get.mockReturnValue(new Promise(r => { resolve = r; }));
    renderEntry();
    expect(screen.getByText(/preparando seu acesso/i)).toBeInTheDocument();
    resolve({ data: { data: { status: 'trial', trialEndsAt: '2100-01-01T00:00:00Z' } } });
    expect(await screen.findByText('/chat')).toBeInTheDocument();
  });
  it('conserva o dashboard quando a consulta falha', async () => {
    localStorage.setItem('token', 'sessao'); get.mockRejectedValue(new Error('offline')); renderEntry();
    expect(await screen.findByText('/dashboard')).toBeInTheDocument();
  });
  it('exige sessão antes de consultar o plano', async () => {
    renderEntry(); expect(await screen.findByText('/login')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});
