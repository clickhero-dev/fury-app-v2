/* # Language: pt-BR
Funcionalidade: sessão demo sem autenticação parcial
  Cenário: falha ou resposta incompleta permite retry manual sem estado parcial
    Dado uma API temporariamente indisponível
    Quando o visitante solicita a demo
    Então não há sessão nem retry automático e uma nova tentativa pode entrar
*/
import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDemoLogin } from './useLogin';
const mocks = vi.hoisted(() => ({ post: vi.fn(), dispatch: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { post: mocks.post } }));
vi.mock('../store/hooks', () => ({ useAppDispatch: () => mocks.dispatch }));
vi.mock('../lib/posthog', () => ({ captureEvent: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); localStorage.clear(); });
it.each([new Error('503'), new Error('timeout'), null])('Cenário: falha %s não autentica e retry manual recupera', async failure => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 3, retryDelay: 0 } } });
  mocks.post.mockImplementationOnce(() => failure ? Promise.reject(failure) : Promise.resolve({ data: { data: { token: 'partial' } } }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useDemoLogin(), { wrapper });
  await act(async () => { await expect(result.current.mutateAsync()).rejects.toBeDefined(); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post).toHaveBeenCalledWith('/auth/demo-login', undefined, { timeout: 15000 });
  expect(localStorage.length).toBe(0);
  expect(mocks.dispatch).not.toHaveBeenCalled();
  mocks.post.mockResolvedValueOnce({ data: { data: { token: 'access', refreshToken: 'refresh', user: { id: 'demo', tenantId: 'tenant', email: 'demo@example.test' } } } });
  await act(async () => { await result.current.mutateAsync(); });
  expect(mocks.dispatch).toHaveBeenCalledOnce();
  expect(localStorage.getItem('token')).toBe('access');
  client.clear();
});
