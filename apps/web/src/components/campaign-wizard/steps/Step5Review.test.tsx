import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Step5Review } from './Step5Review';
import type { WizardState } from '../types';

const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost },
}));

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const baseState: WizardState = {
  currentStep: 5,
  objective: 'leads',
  whatsapp: { pageName: 'Página Teste', destinations: ['whatsapp'], phoneNumberDisplay: '(55) 98128-6344' },
  creatives: [
    {
      id: 'c1', headline: 'Teste', primaryText: 'Teste',
      assetUrl: 'https://cdn.example.com/img.jpg',
    },
  ],
  audience: { city: 'Santos, São Paulo', cityKey: '123', ageMin: 18, ageMax: 65, gender: 'male' },
  budget: { dailyBudgetBrl: 20, durationDays: 7 },
} as unknown as WizardState;

function renderReview() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <Step5Review
        state={baseState}
        onViewCampaigns={vi.fn()}
        onCreateAnother={vi.fn()}
        onBack={vi.fn()}
        onEditField={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function permissionDeniedError(): unknown {
  return {
    response: {
      data: {
        error: {
          code: 'META_PERMISSION_DENIED',
          message: 'O Meta recusou a criação do Formulário por falta de permissão (pages_manage_metadata).',
        },
      },
    },
  };
}

describe('Step5Review — erro de permissão do Meta oferece reconexão', () => {
  it('erro META_PERMISSION_DENIED mostra botão "Reconectar Meta" além da mensagem', async () => {
    mockApiPost.mockRejectedValueOnce(permissionDeniedError());

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconectar Meta' })).toBeInTheDocument();
    });
    // Mensagem de erro original continua visível
    expect(screen.getByText(/pages_manage_metadata/)).toBeInTheDocument();
  });

  it('botão "Reconectar Meta" redireciona para a URL de OAuth do Meta', async () => {
    mockApiPost.mockRejectedValueOnce(permissionDeniedError());
    mockApiGet.mockResolvedValueOnce({
      data: { data: { authUrl: 'https://www.facebook.com/v23.0/dialog/oauth?client_id=x' } },
    });
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, href: '' },
    });

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconectar Meta' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar Meta' }));
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/meta/auth/url', {
        params: { context: 'settings', frontendUrl: window.location.origin, rerequest: 'true' },
      });
      expect(window.location.href).toBe('https://www.facebook.com/v23.0/dialog/oauth?client_id=x');
    });
  });

  it('erro genérico do Meta NÃO mostra o botão de reconexão', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: { data: { error: { code: 'META_API_ERROR', message: 'Erro qualquer' } } },
    });

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));

    await waitFor(() => {
      expect(screen.getByText('Erro qualquer')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Reconectar Meta' })).not.toBeInTheDocument();
  });
});
