import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { GoogleOwnerOverview } from '@/types/google';

const { mockUseGoogleOverview } = vi.hoisted(() => ({ mockUseGoogleOverview: vi.fn() }));

vi.mock('../useGoogleMeuNegocio', () => ({ useGoogleOverview: mockUseGoogleOverview }));

import { OwnerPanel } from './OwnerPanel';

function makeOverview(overrides: Partial<GoogleOwnerOverview> = {}): GoogleOwnerOverview {
  return {
    profile: {
      id: 'p-1',
      name: 'Padaria Estrela',
      logoUrl: null,
      verified: true,
      categoryName: 'Padaria',
      syncStatus: 'verified',
    },
    interactions: null,
    strength: {
      percent: 82,
      complete: false,
      missingCount: 1,
      items: [
        { key: 'name', label: 'Adicione o nome da empresa', done: true, weight: 10 },
        { key: 'description', label: 'Adicione uma descrição', done: false, weight: 10 },
      ],
    },
    actions: [
      { key: 'edit_profile', label: 'Editar perfil', kind: 'core', status: 'available' },
      { key: 'reviews', label: 'Ler avaliações', kind: 'core', status: 'coming_soon' },
      { key: 'ads', label: 'Anunciar', kind: 'core', status: 'available' },
      { key: 'hotel_details', label: 'Detalhes do hotel', kind: 'category', status: 'external', externalUrl: 'https://business.google.com/' },
    ],
    suggestions: [
      {
        id: 'complete_profile',
        title: 'Ajudar os clientes a encontrar sua empresa',
        description: 'Complete o Perfil da Empresa.',
        cta: { label: 'Completar perfil', action: 'edit_profile' },
      },
      {
        id: 'create_ad',
        title: 'Criar anúncio',
        description: 'Promova sua empresa com um anúncio no Google.',
        cta: { label: 'Criar anúncio', action: 'ads' },
      },
    ],
    reviewLink: null,
    ...overrides,
  };
}

function mockLoaded(overview: GoogleOwnerOverview) {
  mockUseGoogleOverview.mockReturnValue({ data: overview, isLoading: false, isError: false, refetch: vi.fn() });
}

describe('OwnerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renderiza cabeçalho, selo, anel e rodapé dentro do escopo ady-decor', () => {
    mockLoaded(makeOverview());
    const { container } = render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);

    expect(screen.getByText('Sua empresa no Google')).toBeInTheDocument();
    expect(screen.getByText('Padaria Estrela · Padaria')).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil verificado')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Força do perfil: 82%' })).toHaveAttribute('data-complete', 'false');
    expect(screen.getByText('Informações incompletas')).toBeInTheDocument();
    expect(screen.getByText('Só os administradores do perfil podem ver isso')).toBeInTheDocument();
    expect(screen.getByText('Prévia gerada pelo Ady')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('ady-decor', 'gmb-scope');
  });

  it('anel verde e "Informações completas" com 100%', () => {
    mockLoaded(makeOverview({ strength: { percent: 100, complete: true, missingCount: 0, items: [] } }));
    render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Força do perfil: 100%' })).toHaveAttribute('data-complete', 'true');
    expect(screen.getByText('Informações completas')).toBeInTheDocument();
  });

  it('mostra interações quando existem', () => {
    mockLoaded(makeOverview({ interactions: { total: 566, periodDays: 28 } }));
    render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    expect(screen.getByText('566 interações com clientes')).toBeInTheDocument();
  });

  it('abre a lista do que falta na força do perfil', () => {
    mockLoaded(makeOverview());
    render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Força do perfil/ }));
    expect(screen.getByText('Adicione uma descrição')).toBeInTheDocument();
    expect(screen.queryByText('Adicione o nome da empresa')).not.toBeInTheDocument();
  });

  it('grade: disponível chama onAction, "Em breve" desabilitado, categoria abre o Google', () => {
    const onAction = vi.fn();
    mockLoaded(makeOverview());
    render(<OwnerPanel profileId="p-1" onAction={onAction} />);
    const grid = screen.getByRole('list', { name: 'Ações do perfil' });

    fireEvent.click(within(grid).getByRole('button', { name: /Editar perfil/ }));
    expect(onAction).toHaveBeenCalledWith('edit_profile');

    expect(within(grid).getByRole('button', { name: /Ler avaliações/ })).toBeDisabled();
    expect(within(grid).getByText('Em breve')).toBeInTheDocument();

    const hotel = within(grid).getByRole('link', { name: /Detalhes do hotel/ });
    expect(hotel).toHaveAttribute('href', 'https://business.google.com/');
    expect(hotel).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(grid).queryByText(/diárias|Perguntas/)).not.toBeInTheDocument();
  });

  it('não verificado: aviso e ação bloqueada com motivo', () => {
    mockLoaded(
      makeOverview({
        profile: { ...makeOverview().profile, verified: false },
        actions: [{ key: 'reviews', label: 'Ler avaliações', kind: 'core', status: 'requires_verification' }],
      }),
    );
    render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    expect(screen.queryByLabelText('Perfil verificado')).not.toBeInTheDocument();
    expect(screen.getByText(/ainda não verificado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ler avaliações/ })).toBeDisabled();
    expect(screen.getByText('Verifique o perfil para usar')).toBeInTheDocument();
  });

  it('sugestão: CTA chama onAction e X dispensa e persiste', () => {
    const onAction = vi.fn();
    mockLoaded(makeOverview());
    const { unmount } = render(<OwnerPanel profileId="p-1" onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: 'Criar anúncio' }));
    expect(onAction).toHaveBeenCalledWith('ads');

    fireEvent.click(screen.getByRole('button', { name: 'Dispensar: Criar anúncio' }));
    expect(screen.queryByText('Promova sua empresa com um anúncio no Google.')).not.toBeInTheDocument();
    unmount();

    render(<OwnerPanel profileId="p-1" onAction={onAction} />);
    expect(screen.queryByText('Promova sua empresa com um anúncio no Google.')).not.toBeInTheDocument();
    expect(screen.getByText('Ajudar os clientes a encontrar sua empresa')).toBeInTheDocument();
  });

  it('carregando e erro com tentar novamente', () => {
    mockUseGoogleOverview.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    const { rerender } = render(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    expect(screen.queryByText('Sua empresa no Google')).not.toBeInTheDocument();

    const refetch = vi.fn();
    mockUseGoogleOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    rerender(<OwnerPanel profileId="p-1" onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalled();
  });
});
