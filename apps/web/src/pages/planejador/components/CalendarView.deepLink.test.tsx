import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarView } from './CalendarView';

// FullCalendar é pesado e não roda bem em jsdom — stub só para o shell renderizar.
vi.mock('@fullcalendar/react', () => ({
  default: () => <div data-testid="full-calendar-stub" />,
}));

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet },
}));

// Diálogos dependem de contexto/API — não abrem no cenário testado, stub para
// isolar o contrato do deep-link (PostTypeDialog é o único que deve aparecer).
vi.mock('./PostSidePanel', () => ({ PostSidePanel: () => null }));
vi.mock('./DeleteConfirmDialog', () => ({ DeleteConfirmDialog: () => null }));
vi.mock('./ScheduleDialog', () => ({ ScheduleDialog: () => null }));
vi.mock('./CreatePostDialog', () => ({ CreatePostDialog: () => null }));

function renderView(initialAction: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (action: string | null) => (
    <QueryClientProvider client={qc}>
      <CalendarView initialAction={action} />
    </QueryClientProvider>
  );
  return { qc, view, ...render(view(initialAction)) };
}

describe('CalendarView — deep-link ?criar=post na MESMA rota', () => {
  beforeEach(() => {
    mockApiGet.mockResolvedValue({ data: { data: { posts: [] } } });
  });

  it('abre o diálogo quando initialAction passa a new-post após o mount (usuário já no /calendario)', async () => {
    const { view, rerender } = renderView(null);

    await screen.findByTestId('full-calendar-stub');
    expect(screen.queryByRole('heading', { name: /novo post/i })).toBeNull();

    // Mesma rota: só o query param mudou, o CalendarView NÃO remonta.
    // A prop initialAction muda de null → 'new-post' no mesmo componente.
    rerender(view('new-post'));

    expect(await screen.findByRole('heading', { name: /novo post/i })).toBeInTheDocument();
  });

  it('não abre o diálogo quando initialAction permanece null', async () => {
    renderView(null);

    await screen.findByTestId('full-calendar-stub');
    expect(screen.queryByRole('heading', { name: /novo post/i })).toBeNull();
  });
});