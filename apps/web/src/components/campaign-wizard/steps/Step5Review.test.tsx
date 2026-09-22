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

function permissionDeniedWithMetaDetails(): unknown {
  return {
    response: {
      data: {
        error: {
          code: 'META_PERMISSION_DENIED',
          message:
            'O Meta recusou a criação do Formulário. Reconecte o Meta em Configurações → Integrações para conceder pages_manage_ads (criação de Formulário de leads) e tente novamente.\n\nDetalhes do Meta: (#200): The user is not an admin of the page and cannot create lead forms.',
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

  it('erro de permissão do Formulário exibe os Detalhes do Meta (diagnóstico da causa real)', async () => {
    // Causa raiz do "reconectei e o erro persiste": o token pode ter o scope
    // pages_manage_ads, mas o Meta recusa porque a pessoa não tem a task ADVERTISE
    // na Página. A mensagem real do Meta precisa chegar ao usuário.
    mockApiPost.mockRejectedValueOnce(permissionDeniedWithMetaDetails());

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));

    await waitFor(() => {
      expect(screen.getByText(/not an admin of the page/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Reconectar Meta' })).toBeInTheDocument();
  });

  it('erro META_PAGE_NOT_MANAGED mostra orientação e NÃO oferece Reconectar Meta', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'META_PAGE_NOT_MANAGED',
            message: 'Você não tem acesso para anunciar nesta Página (é preciso ter papel de administrador ou acesso via Business Manager). Selecione outra Página ou solicite acesso ao dono da página.',
          },
        },
      },
    });

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));

    await waitFor(() => {
      expect(screen.getByText(/Selecione outra Página/i)).toBeInTheDocument();
    });
    // Reconectar o OAuth NÃO resolve — sem botão de reconexão
    expect(screen.queryByRole('button', { name: 'Reconectar Meta' })).not.toBeInTheDocument();
  });

  it('erro META_PAGE_ADVERTISE_TASK_REQUIRED mostra orientação e NÃO oferece Reconectar Meta', async () => {
    mockApiPost.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'META_PAGE_ADVERTISE_TASK_REQUIRED',
            message: 'Você tem acesso à Página, mas sem a permissão de anunciar (task ADVERTISE). Peça ao administrador da Página que conceda o papel de Anunciante ou Administrador.',
          },
        },
      },
    });

    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar Campanha' }));

    await waitFor(() => {
      expect(screen.getByText(/conceda o papel de Anunciante/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Reconectar Meta' })).not.toBeInTheDocument();
  });
});
