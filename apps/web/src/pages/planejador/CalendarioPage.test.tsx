import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { CalendarioPage } from './CalendarioPage';

// CalendarView é pesado (FullCalendar) — fora do escopo deste teste; só
// verificamos o contrato da página com ele (prop initialAction).
// A página limpa o parâmetro logo após consumir, então o primeiro render
// entrega 'new-post' e o re-render seguinte entrega null — registramos a
// sequência em vez de asserir o estado final.
const calendarViewProps = vi.hoisted(() => [] as (string | null)[]);

vi.mock('./components/CalendarView', () => ({
  CalendarView: ({ initialAction }: { initialAction?: string | null }) => {
    calendarViewProps.push(initialAction ?? null);
    return <div data-testid="calendar-view-mock">initialAction:{String(initialAction ?? '')}</div>;
  },
}));

function SearchProbe() {
  const [searchParams] = useSearchParams();
  return <span data-testid="search-probe">{searchParams.toString()}</span>;
}

function renderPage(entry = '/calendario') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CalendarioPage />
      <SearchProbe />
    </MemoryRouter>,
  );
}

describe('CalendarioPage — deep-link de criação de post', () => {
  beforeEach(() => {
    calendarViewProps.length = 0;
  });

  it('entrega initialAction=new-post ao CalendarView quando ?criar=post está na URL', () => {
    renderPage('/calendario?criar=post');

    expect(calendarViewProps).toContain('new-post');
  });

  it('remove o parâmetro da URL após consumir (não reabre em navegação seguinte)', async () => {
    renderPage('/calendario?criar=post');

    await waitFor(() => {
      expect(screen.getByTestId('search-probe').textContent).toBe('');
    });
  });

  it('não dispara ação sem o parâmetro (entrega apenas null)', () => {
    renderPage('/calendario');

    expect(calendarViewProps).toEqual([null]);
  });
});