import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FuryRuleDialog } from './FuryRuleDialog';

describe('FuryRuleDialog', () => {
  it('falha ao salvar mostra o motivo e não fecha', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => {
      throw Object.assign(new Error('400'), { isAxiosError: true, response: { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'Verifique o campo: Nome: campo obrigatório.' } } } });
    });
    render(<FuryRuleDialog isOpen onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar a regra. Verifique o campo: Nome: campo obrigatório.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
