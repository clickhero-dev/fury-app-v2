import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerPaymentPanel } from './PartnerPaymentPanel';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post, delete: del } }));

const plan = { id: 'pay-1', kind: 'plan', amountCents: 249990, paidAt: '2026-11-01', note: 'Parceiro Ouro', createdByName: 'Equipe ady', createdAt: '2026-11-01T12:00:00Z' };
const extra = { id: 'pay-2', kind: 'additional', amountCents: 80000, paidAt: '2026-11-10', note: '+5 vagas', createdByName: null, createdAt: '2026-11-10T12:00:00Z' };
const empty = { totalCents: 0, lastPaidAt: null, payments: [] };
const both = { totalCents: 329990, lastPaidAt: '2026-11-10', payments: [extra, plan] };
const reply = (data: unknown) => ({ data: { data } });
const axiosError = (status: number, message: string) =>
  Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: { error: { message } } } });

describe('PartnerPaymentPanel', () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it('lista o histórico com total, último pagamento e tipos', async () => {
    get.mockResolvedValue(reply(both));
    render(<PartnerPaymentPanel partnerId="p1" />);
    expect(await screen.findByText('R$ 3.299,90')).toBeTruthy();
    expect(screen.getByText('10/11/2026', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('+5 vagas')).toBeTruthy();
    expect(screen.getByText('Parceiro Ouro')).toBeTruthy();
    expect(screen.getByText('Adicional')).toBeTruthy();
    expect(screen.getByText('Plano')).toBeTruthy();
    expect(screen.getByText('Usuário removido')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/admin/partners/p1/payments');
  });

  it('primeiro lançamento nasce como plano e envia tipo e centavos', async () => {
    get.mockResolvedValueOnce(reply(empty)).mockResolvedValueOnce(reply({ totalCents: 249990, lastPaidAt: '2026-11-01', payments: [plan] }));
    post.mockResolvedValue(reply({ payment: plan }));
    render(<PartnerPaymentPanel partnerId="p1" />);

    expect(await screen.findByText('Nenhum pagamento registrado para este parceiro.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Registrar pagamento' }));
    expect(screen.getByRole('button', { name: 'Plano', pressed: true })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '2.499,90' } });
    fireEvent.change(screen.getByLabelText('Descrição (opcional)'), { target: { value: 'Parceiro Ouro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/p1/payments', { kind: 'plan', paidAt: '2026-11-01', amountCents: 249990, note: 'Parceiro Ouro' }));
    expect(await screen.findByText('Pagamento registrado')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('com histórico, o padrão é adicional e a descrição é obrigatória', async () => {
    get.mockResolvedValue(reply({ totalCents: 249990, lastPaidAt: '2026-11-01', payments: [plan] }));
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    expect(screen.getByRole('button', { name: 'Adicional', pressed: true })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Descreva o adicional, por exemplo: +5 vagas.');
    expect(post).not.toHaveBeenCalled();
  });

  it('valor inválido não envia e explica o formato', async () => {
    get.mockResolvedValue(reply(empty));
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '5.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o valor em reais, por exemplo 5.000,00.');
    expect(post).not.toHaveBeenCalled();
  });

  it('erro da API ao registrar aparece com o motivo', async () => {
    get.mockResolvedValue(reply(empty));
    post.mockImplementation(async () => { throw axiosError(400, 'O valor máximo por lançamento é R$ 21.474.836,47'); });
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível registrar o pagamento. O valor máximo por lançamento é R$ 21.474.836,47');
  });

  it('erro ao carregar mostra o motivo e tenta de novo', async () => {
    get.mockImplementationOnce(async () => { throw axiosError(500, 'Banco indisponível'); }).mockResolvedValueOnce(reply(empty));
    render(<PartnerPaymentPanel partnerId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os pagamentos');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhum pagamento registrado para este parceiro.')).toBeTruthy();
  });

  it('excluir um lançamento só libera depois da espera', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(reply(both)).mockResolvedValueOnce(reply({ totalCents: 249990, lastPaidAt: '2026-11-01', payments: [plan] }));
    del.mockResolvedValue(reply({ removed: true }));
    render(<PartnerPaymentPanel partnerId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir pagamento de 10/11/2026' }));

    const confirm = screen.getByRole('button', { name: /Aguarde 5s/ });
    expect(confirm).toBeDisabled();
    await vi.advanceTimersByTimeAsync(5000);
    const ready = await screen.findByRole('button', { name: /Sim, excluir/ });
    expect(ready).not.toBeDisabled();
    fireEvent.click(ready);
    await waitFor(() => expect(del).toHaveBeenCalledWith('/admin/partners/p1/payments/pay-2'));
    expect(await screen.findByText('Pagamento excluído')).toBeTruthy();
    expect(screen.queryByText('+5 vagas')).toBeNull();
  });

  it('primeiro lançamento vem com preço e nome do plano do parceiro', async () => {
    get.mockResolvedValue(reply(empty));
    post.mockResolvedValue(reply({ payment: plan }));
    render(<PartnerPaymentPanel partnerId="p1" planName="Parceiro Ouro" planPriceCents={249990} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Registrar pagamento' }));
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue('2.499,90');
    expect(screen.getByLabelText('Descrição (opcional)')).toHaveValue('Parceiro Ouro');
  });
});
