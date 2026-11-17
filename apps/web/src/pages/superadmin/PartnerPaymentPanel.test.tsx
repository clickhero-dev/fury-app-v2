import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerPaymentPanel } from './PartnerPaymentPanel';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post, delete: del } }));

const payment = { id: 'pay-1', amountCents: 500000, paidAt: '2026-11-10', note: 'Venda inicial', createdByName: 'Equipe ady', createdAt: '2026-11-10T12:00:00Z' };

describe('PartnerPaymentPanel', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('sem pagamento: registra e mostra o pagamento', async () => {
    get.mockResolvedValue({ data: { data: { payment: null } } });
    post.mockResolvedValue({ data: { data: { payment } } });
    render(<PartnerPaymentPanel partnerId="p1" />);

    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '5.000,00' } });
    fireEvent.change(screen.getByLabelText('Observação (opcional)'), { target: { value: 'Venda inicial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/p1/payment', { paidAt: '2026-11-10', amountCents: 500000, note: 'Venda inicial' }));
    expect(await screen.findByText('R$ 5.000,00')).toBeTruthy();
    expect(screen.getByText('Equipe ady')).toBeTruthy();
  });

  it('valor inválido não envia e explica o formato', async () => {
    get.mockResolvedValue({ data: { data: { payment: null } } });
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '5.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o valor em reais, por exemplo 5.000,00.');
    expect(post).not.toHaveBeenCalled();
  });

  it('erro da API aparece com o motivo', async () => {
    get.mockResolvedValue({ data: { data: { payment: null } } });
    post.mockImplementation(async () => {
      throw Object.assign(new Error('409'), { isAxiosError: true, response: { status: 409, data: { error: { code: 'PAYMENT_EXISTS', message: 'Este parceiro já tem um pagamento registrado. Exclua o atual para registrar outro.' } } } });
    });
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível registrar o pagamento. Este parceiro já tem um pagamento registrado.');
  });

  it('excluir só libera depois da espera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue({ data: { data: { payment } } });
    del.mockResolvedValue({ data: { data: { payment: null } } });
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir pagamento/ }));

    const confirm = screen.getByRole('button', { name: /Aguarde 5s/ });
    expect(confirm).toBeDisabled();
    await vi.advanceTimersByTimeAsync(5000);
    const ready = await screen.findByRole('button', { name: /Sim, excluir/ });
    expect(ready).not.toBeDisabled();
    fireEvent.click(ready);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/admin/partners/p1/payment/pay-1'));
    expect(await screen.findByText('Nenhum pagamento registrado para este parceiro.')).toBeTruthy();
  });
});
