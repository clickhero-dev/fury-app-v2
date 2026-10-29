/*
# Language: pt-BR

Funcionalidade: preencher e publicar uma campanha Google Ads

  Cenário: concluir o formulário Google com a localização configurada
    Dado uma conexão Google e um Perfil da Empresa configurados
    Quando a pessoa escolhe o objetivo, a localização e preenche o anúncio
    E confirma a criação
    Então a API recebe a campanha com a localização escolhida
    Então a tela informa que a campanha foi criada e ativada

  Cenário: selecionar uma conta Google Ads acessível
    Dado uma conexão Google e duas contas Google Ads acessíveis
    Quando a pessoa escolhe uma conta antes de preencher o anúncio
    Então a revisão usa a conta escolhida

  Cenário: informar quando Google Ads não foi configurado
    Dado uma conexão Google e o Google Ads indisponível neste ambiente
    Quando a pessoa abre a opção Google
    Então ela vê como concluir a configuração antes de criar a campanha

  Cenário: bloquear criação sem localização do Perfil da Empresa
    Dado uma conexão Google e uma conta Ads acessível
    Quando o Perfil da Empresa não possui endereço configurado
    Então a pessoa é orientada a configurar o Perfil antes de criar a campanha

  Cenário: informar quando não há contas Google Ads acessíveis
    Dado uma conexão Google e um Perfil da Empresa configurados
    Quando a conta não possui customer IDs acessíveis
    Então a pessoa é orientada a revisar as permissões antes de criar a campanha
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GoogleAdsCampaignPage } from './GoogleAdsCampaignPage';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiPut = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet, post: mockApiPost, put: mockApiPut, patch: vi.fn(), delete: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe('GoogleAdsCampaignPage — criação guiada', () => {
  beforeEach(() => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/google/connections') return Promise.resolve({ data: { success: true, data: { id: 'g-1', tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() } } });
      if (url === '/google/settings') return Promise.resolve({ data: { success: true, data: { address: { city: 'São Paulo', state: 'SP', country: 'BR' } } } });
      if (url === '/google-ads/accounts') return Promise.resolve({ data: { success: true, data: ['1111111111', '2222222222'] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    mockApiPost.mockResolvedValue({ data: { success: true, data: { campaignId: 'g-1', status: 'ENABLED' } } });
    mockApiPut.mockResolvedValue({ data: { success: true, data: { accountId: '2222222222' } } });
  });

  it('envia a localização escolhida e mostra sucesso', async () => {
    const user = userEvent.setup();
    render(<GoogleAdsCampaignPage />, { wrapper });

    await user.type(await screen.findByLabelText('Título do anúncio 1'), 'Promoção local');
    await user.type(screen.getByLabelText('Título do anúncio 2'), 'Atendimento rápido');
    await user.type(screen.getByLabelText('Título do anúncio 3'), 'Fale conosco');
    await user.type(screen.getByLabelText('Título longo'), 'Promoção local para sua empresa');
    await user.type(screen.getByLabelText('Descrição 1'), 'Fale com nossa equipe');
    await user.type(screen.getByLabelText('Descrição 2'), 'Atendimento personalizado');
    await user.type(screen.getByLabelText('Site de destino'), 'https://example.com');
    await user.type(screen.getByLabelText('Imagem paisagem (1,91:1)'), 'https://example.com/1.jpg');
    await user.type(screen.getByLabelText('Imagem quadrada (1:1)'), 'https://example.com/2.jpg');
    await user.click(screen.getByLabelText('Estado: SP'));
    await user.click(screen.getByRole('button', { name: /Criar e ativar campanha/i }));

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(
      '/google-ads/campaigns',
      expect.objectContaining({ locationLevel: 'state' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }),
    ));
    expect(await screen.findByRole('alert')).toHaveTextContent(/campanha criada e ativada/i);
  }, 10000);

  it('permite escolher a conta Google Ads acessível', async () => {
    const user = userEvent.setup();
    render(<GoogleAdsCampaignPage />, { wrapper });

    const accountSelect = await screen.findByLabelText('Conta Google Ads');
    await user.selectOptions(accountSelect, '2222222222');

    expect((accountSelect as HTMLSelectElement).value).toBe('2222222222');
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledWith('/google-ads/accounts/selected', { customerId: '2222222222' }));
  });

  it('informa quando a integração Google Ads não está configurada', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/google/connections') return Promise.resolve({ data: { success: true, data: { id: 'g-1', tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() } } });
      if (url === '/google/settings') return Promise.resolve({ data: { success: true, data: { address: { city: 'São Paulo', state: 'SP', country: 'BR' } } } });
      if (url === '/google-ads/accounts') return Promise.reject({ response: { status: 503, data: { error: { code: 'GOOGLE_ADS_NOT_CONFIGURED' } } } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<GoogleAdsCampaignPage />, { wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Google Ads ainda não está configurado neste ambiente/i);
    expect(screen.queryByRole('button', { name: /Criar e ativar campanha/i })).not.toBeInTheDocument();
  });

  it('orienta a configurar o Perfil da Empresa quando não há localização', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/google/connections') return Promise.resolve({ data: { success: true, data: { id: 'g-1', tokenExpiresAt: new Date(Date.now() + 60_000).toISOString() } } });
      if (url === '/google/settings') return Promise.resolve({ data: { success: true, data: { address: { city: '', state: '', country: 'BR' } } } });
      if (url === '/google-ads/accounts') return Promise.resolve({ data: { success: true, data: ['1111111111'] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<GoogleAdsCampaignPage />, { wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Configure seu Perfil da Empresa/i);
    expect(screen.queryByRole('button', { name: /Criar e ativar campanha/i })).not.toBeInTheDocument();
  });

  it('informa quando não há contas Google Ads acessíveis', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/google/connections') return Promise.resolve({ data: { success: true, data: { id: 'g-1' } } });
      if (url === '/google/settings') return Promise.resolve({ data: { success: true, data: { address: { city: 'São Paulo', state: 'SP', country: 'BR' } } } });
      if (url === '/google-ads/accounts') return Promise.resolve({ data: { success: true, data: [] } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    render(<GoogleAdsCampaignPage />, { wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent(/não encontramos contas Google Ads acessíveis/i);
    expect(screen.queryByRole('button', { name: /Criar e ativar campanha/i })).not.toBeInTheDocument();
  });
});
