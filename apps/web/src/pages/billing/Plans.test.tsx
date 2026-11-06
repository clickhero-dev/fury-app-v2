import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Plans } from './Plans';

/*
 * Funcionalidade: plano Trial disponível na página Planos
 * Cenário: pessoa consulta os limites do Trial
 * Dado que a API disponibiliza o plano Trial, quando abre Planos,
 * então vê a duração, as cinco imagens, as três revisões e a ausência de vídeos.
 */
const { mockBilling } = vi.hoisted(() => ({
  mockBilling: {
    plans: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock('@/hooks/useBilling', () => ({
  usePlans: () => ({ data: mockBilling.plans, isLoading: false }),
  useSubscription: () => ({ data: null }),
  useSubscribe: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

function renderPlans() {
  return render(
    <MemoryRouter>
      <Plans />
    </MemoryRouter>,
  );
}

describe('Planos — apresentação do Trial', () => {
  beforeEach(() => {
    mockBilling.plans = [{
      id: 'trial-plan',
      name: 'Trial',
      priceCents: 0,
      interval: 'monthly',
      features: { trialDays: 7, images: 5, revisionsPerImage: 3, videos: false },
      isActive: true,
      createdAt: '2026-11-06T00:00:00.000Z',
    }];
  });

  it('exibe os limites do Trial recebidos da API', () => {
    renderPlans();

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('7 dias de acesso')).toBeInTheDocument();
    expect(screen.getByText('5 criações de imagem')).toBeInTheDocument();
    expect(screen.getByText('Até 3 revisões por criação')).toBeInTheDocument();
    expect(screen.getByText('Geração de vídeo não incluída')).toBeInTheDocument();
    expect(screen.getByText('O plano Trial oferece 7 dias gratuitos para novas contas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automático no cadastro' })).toBeDisabled();
    expect(screen.getByText(/assinaturas pagas são processadas com segurança via Asaas/i)).toBeInTheDocument();
  });
});
