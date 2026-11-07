/*
Funcionalidade: aceitar a Política de Uso sem bloquear o Trial
Cenário: usuário Trial aceita a política sem Meta
  Dado que o aceite é salvo e não existe conexão Meta local
  Quando a pessoa aceita a política
  Então retorna ao dashboard para a API confirmar o Trial
Cenário: falha ao salvar o aceite
  Dado que a API rejeita o aceite
  Quando a pessoa aceita a política
  Então o erro aparece e a página permanece aberta
*/
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost, dispatchMock } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
}));
vi.mock('../../lib/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({
    auth: { token: 'auth-token', policy: { currentVersion: '1.0', accepted: false } },
  }),
}));

import { PoliticaDeUsoPage } from './PoliticaDeUsoPage';

function renderPolicyPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/politica']}>
        <Routes>
          <Route path="/politica" element={<PoliticaDeUsoPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard" />} />
          <Route path="/onboarding/conectar-meta" element={<div data-testid="meta-onboarding" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  apiGet.mockReset().mockResolvedValue({
    data: { data: { currentVersion: '1.0', currentVersionId: 'v1', accepted: false, content: 'Texto da política' } },
  });
  apiPost.mockReset().mockResolvedValue({ data: { data: { accepted: true, currentVersion: '1.0' } } });
  dispatchMock.mockReset();
});

describe('PoliticaDeUsoPage — retorno após aceite Trial', () => {
  it('aceite concluído retorna ao dashboard sem exigir flag local de Meta', async () => {
    renderPolicyPage();
    await screen.findByText('Texto da política');
    fireEvent.click(screen.getByTestId('policy-agree-checkbox'));
    fireEvent.click(screen.getByTestId('policy-accept-button'));

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
    expect(apiPost).toHaveBeenCalledWith('/policy/accept', { versionId: 'v1' });
  });

  it('falha ao registrar o aceite mostra erro sem avançar', async () => {
    apiPost.mockRejectedValueOnce(new Error('Falha de rede'));
    renderPolicyPage();
    await screen.findByText('Texto da política');
    fireEvent.click(screen.getByTestId('policy-agree-checkbox'));
    fireEvent.click(screen.getByTestId('policy-accept-button'));

    expect(await screen.findByText('Não foi possível registrar o aceite. Tente novamente.')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(screen.queryByTestId('meta-onboarding')).toBeNull();
  });
});
