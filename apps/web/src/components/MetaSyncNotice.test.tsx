// @vitest-environment jsdom
/*
# Language: pt-BR

Funcionalidade: comunicar a atualização automática dos dados da Meta

  Cenário: mostrar a data da última atualização em uma faixa discreta
    Dado que há dados anteriores e a Meta está sendo consultada
    Quando o aviso é exibido
    Então o cliente vê uma mensagem tranquila e a data da última atualização

  Cenário: primeira sincronização sem data anterior
    Dado que ainda não há dados da Meta
    Quando o aviso é exibido
    Então o cliente vê que os dados aparecerão automaticamente
*/
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetaSyncNotice } from './MetaSyncNotice';

describe('MetaSyncNotice', () => {
  it('Cenário: mostrar a data da última atualização em uma faixa discreta', () => {
    render(<MetaSyncNotice syncedAt="2026-09-28T17:30:00.000Z" />);

    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('Estamos consultando seus dados na Meta');
    expect(notice.textContent).toContain('Última atualização: 28/09 às 14:30');
    expect(notice.textContent).toContain('Os novos dados aparecerão automaticamente.');
    expect(notice.className).toContain('bg-sky-50');
  });

  it('Cenário: primeira sincronização sem data anterior', () => {
    render(<MetaSyncNotice firstSyncPending />);

    expect(screen.getByRole('status').textContent).toContain('Estamos preparando seus dados. Eles aparecerão aqui automaticamente.');
    expect(screen.queryByText(/Última atualização:/)).toBeNull();
  });
});
