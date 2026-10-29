/*
# Language: pt-BR

Funcionalidade: Perfil existente após reconectar a conta Google

  Cenário: carregar o perfil que o lookup descobriu
    Dado que a conta Google está conectada e administra um perfil existente
    Quando a tela do Google Meu Negócio é aberta após o OAuth
    Então exibe o painel do perfil já sincronizado sem exigir a criação de outro perfil

  Cenário: abrir a experiência da Sprint 7 com dados simulados
    Dado que a pessoa acessa o Perfil Google na Fase 1
    Quando a tela é aberta sem modo de integração explícito
    Então vê o protótipo local e não inicia o fluxo conectado ao Google
*/
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const hooks = vi.hoisted(() => ({
  sync: vi.fn(),
}));

vi.mock('@/components', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LoadingSpinner: () => <span>Carregando</span>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/hooks/useGoogleSettings', () => ({
  useGoogleSettings: () => ({ data: null }),
}));

vi.mock('./useGoogleMeuNegocio', () => ({
  useGoogleConnection: () => ({ data: { id: 'connection-1', connected: true }, isLoading: false }),
  useGoogleLookup: () => ({
    data: { found: true, matches: [], duplicateAlert: false, profile: { id: 'profile-existing' } },
    isLoading: false,
    isError: false,
  }),
  useGoogleConnect: () => ({ mutate: vi.fn(), isPending: false }),
  useGoogleDisconnect: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useVerification: () => ({ data: null, isLoading: false }),
  useCompleteVerification: () => ({ mutate: vi.fn(), isPending: false }),
  useGoogleProfile: (profileId: string | null) => ({
    data: profileId ? { id: profileId, name: 'Perfil existente sincronizado', photos: [] } : null,
    isLoading: false,
  }),
  useSyncProfile: () => ({ mutate: hooks.sync, isPending: false }),
  useSyncLogs: () => ({ data: { logs: [] }, isLoading: false }),
}));

vi.mock('./components/GoogleConnectionCard', () => ({
  GoogleConnectionCard: () => <div>Conta Google conectada</div>,
}));
vi.mock('./components/ProfileLookupResult', () => ({
  ProfileLookupResult: () => <div>Perfil localizado</div>,
}));
vi.mock('./components/ProfileStatusPanel', () => ({
  ProfileStatusPanel: ({ profile }: { profile: { name: string } }) => <div>{profile.name}</div>,
}));
vi.mock('./components/PhotoUploader', () => ({
  PhotoUploader: () => <div>Fotos do perfil</div>,
}));
vi.mock('./components/BusinessProfileForm', () => ({
  BusinessProfileForm: () => <div>Dados do negócio</div>,
}));

import { GoogleMeuNegocioPage } from './GoogleMeuNegocioPage';

describe('GoogleMeuNegocioPage — perfil existente após reconexão', () => {
  it('exibe o painel do perfil que o lookup sincronizou', () => {
    render(
      <MemoryRouter initialEntries={['/configuracoes/google-meu-negocio?modo=integracao']}>
        <GoogleMeuNegocioPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Perfil existente sincronizado')).toBeInTheDocument();
    expect(screen.getByText('Fotos do perfil')).toBeInTheDocument();
  });

  it('abre por padrão a experiência mock sem renderizar a integração Google existente', () => {
    render(
      <MemoryRouter initialEntries={['/configuracoes/google-meu-negocio']}>
        <GoogleMeuNegocioPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('tab', { name: 'Avaliações' })).toBeInTheDocument();
    expect(screen.getByText('Dados demonstrativos')).toBeInTheDocument();
    expect(screen.queryByText('Conta Google conectada')).not.toBeInTheDocument();
  });
});
