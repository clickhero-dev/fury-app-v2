// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryStatus } from './RecoveryStatus';

afterEach(cleanup);
describe('Status de recuperação e cancelamento', () => {
  it('explica recuperação sem reenviar prompt e aguarda status persistido depois de cancelar', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const view = render(<RecoveryStatus status="recovering" onCancel={cancel}/>);
    expect(screen.getByText(/sem reenviar sua mensagem/)).toBeVisible();
    expect(screen.getByText(/já iniciada pode continuar/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar próximas etapas' }));
    await screen.findByText(/Solicitação enviada/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Execução cancelada.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar próximas etapas' })).toBeDisabled();
    view.rerender(<RecoveryStatus status="cancelled" onCancel={cancel}/>);
    expect(screen.getByText(/Próximas etapas canceladas/)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('falha de transporte não afirma cancelamento nem permite repetição cega', async () => {
    render(<RecoveryStatus status="running" onCancel={vi.fn().mockRejectedValue(new Error('offline'))}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar próximas etapas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível confirmar/);
    expect(screen.getByRole('button')).toBeDisabled();
  });
  it('oferece outra direção apenas após cancelamento confirmado e não apaga a conversa', () => {
    const redirect = vi.fn();
    const view = render(<RecoveryStatus status="cancel_requested" onCancel={vi.fn()} onRedirect={redirect}/>);
    expect(screen.queryByRole('button', {name:'Ver outra ideia'})).toBeNull();
    view.rerender(<RecoveryStatus status="cancelled" onCancel={vi.fn()} onRedirect={redirect}/>);
    fireEvent.click(screen.getByRole('button', {name:'Ver outra ideia'}));
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/ação externa já iniciada pode continuar/)).toBeVisible();
  });
  it.each(['uncertain', 'failed', 'completed', 'cancelled', 'cancel_requested'] as const)('não oferece cancelamento no status %s', status => {
    render(<RecoveryStatus status={status} onCancel={vi.fn()}/>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
  });
});
