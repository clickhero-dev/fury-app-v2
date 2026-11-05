import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsappVerificationCard } from './WhatsappVerificationCard';

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ default: mockApi }));

function renderCard(props: Partial<{ whatsappNumber: string | null }> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const number = 'whatsappNumber' in props ? props.whatsappNumber : '11999999999';
  return render(
    <QueryClientProvider client={qc}>
      <WhatsappVerificationCard whatsappNumber={number} />
    </QueryClientProvider>,
  );
}

describe('WhatsappVerificationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sem número cadastrado → estado vazio com dica', async () => {
    mockApi.get.mockResolvedValue({ data: { data: null } });
    renderCard({ whatsappNumber: null });
    expect(await screen.findByText(/Cadastre um número/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verificar/i })).not.toBeInTheDocument();
  });

  it('sem verificação existente → mostra botão verificar número', async () => {
    mockApi.get.mockResolvedValue({ data: { data: null } });
    renderCard();
    expect(await screen.findByRole('button', { name: /verificar número/i })).toBeInTheDocument();
  });

  it('verificação verified → badge Verificado, sem botão', async () => {
    mockApi.get.mockResolvedValue({
      data: { data: { id: 'v1', phone: '5511999999999', status: 'verified', verifiedAt: '2026-09-21T15:00:00Z', expiresAt: '2026-09-21T15:10:00Z' } },
    });
    renderCard();
    expect(await screen.findByText(/Verificado/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verificar número/i })).not.toBeInTheDocument();
  });

  it('clique em verificar → start e aparece o passo do código', async () => {
    mockApi.get.mockResolvedValue({ data: { data: null } });
    mockApi.post.mockResolvedValue({
      data: { data: { id: '11111111-1111-4111-8111-111111111111', phone: '5511999999999', expiresAt: new Date().toISOString() } },
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /verificar número/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/wpp/verify/start', { phone: '11999999999' });
    expect(await screen.findByText(/Enviamos um código/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
  });

  it('confirm com código certo → badge verificado', async () => {
    let confirmed = false;
    mockApi.get.mockImplementation(() =>
      Promise.resolve(
        confirmed
          ? { data: { data: { id: 'v1', phone: '5511999999999', status: 'verified', verifiedAt: new Date().toISOString(), expiresAt: new Date().toISOString() } } }
          : { data: { data: null } },
      ),
    );
    mockApi.post.mockImplementation((url: string) => {
      if (url === '/wpp/verify/start') {
        return Promise.resolve({ data: { data: { id: '11111111-1111-4111-8111-111111111111', phone: '5511999999999', expiresAt: new Date().toISOString() } } });
      }
      confirmed = true;
      return Promise.resolve({ data: { data: { verified: true, status: 'verified' } } });
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /verificar número/i }));
    const inputs = await screen.findAllByRole('textbox');
    await user.type(inputs[0], '123456');
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/wpp/verify/confirm', {
      verificationId: '11111111-1111-4111-8111-111111111111',
      code: '123456',
    });
    expect(await screen.findByText(/Verificado/i)).toBeInTheDocument();
  });

  it('start com 429 (rate limit) → mensagem amigável, sem quebrar', async () => {
    mockApi.get.mockResolvedValue({ data: { data: null } });
    mockApi.post.mockRejectedValue({
      response: { status: 429, data: { error: { message: 'Muitos envios para este número.' } } },
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /verificar número/i }));
    expect(await screen.findByText(/Muitos envios|aguarde/i)).toBeInTheDocument();
  });

  it('start com 400 número fora do WhatsApp → mensagem do backend', async () => {
    mockApi.get.mockResolvedValue({ data: { data: null } });
    mockApi.post.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'Este número não possui conta no WhatsApp.' } } },
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /verificar número/i }));
    expect(await screen.findByText(/não possui conta no WhatsApp/i)).toBeInTheDocument();
  });
});
