import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { SnackHost } from './SnackHost';
import { showSnack } from '@/lib/snack';

describe('SnackHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o snack ao chamar showSnack e some automaticamente após 3s', () => {
    render(<SnackHost />);

    act(() => {
      showSnack('Campanha cancelada com sucesso');
    });

    expect(screen.getByText(/Campanha cancelada com sucesso/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText(/Campanha cancelada com sucesso/)).not.toBeInTheDocument();
  });

  it('renderiza ação opcional de link no snack', () => {
    render(<SnackHost />);

    act(() => {
      showSnack('Os anexos falharam', 'error', { label: 'Abrir tarefa', href: 'https://app.clickup.com/t/task-123' });
    });

    expect(screen.getByRole('link', { name: 'Abrir tarefa' })).toHaveAttribute('href', 'https://app.clickup.com/t/task-123');
  });
});
