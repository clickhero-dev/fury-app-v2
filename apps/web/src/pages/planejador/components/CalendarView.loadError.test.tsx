import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarView } from './CalendarView';

vi.mock('@fullcalendar/react', () => ({ default: () => <div data-testid="full-calendar-stub" /> }));
const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: mockApiGet } }));
vi.mock('./PostSidePanel', () => ({ PostSidePanel: () => null }));
vi.mock('./DeleteConfirmDialog', () => ({ DeleteConfirmDialog: () => null }));
vi.mock('./ScheduleDialog', () => ({ ScheduleDialog: () => null }));
vi.mock('./CreatePostDialog', () => ({ CreatePostDialog: () => null }));

describe('CalendarView — falha ao carregar', () => {
  it('mostra o motivo em vez de um calendário vazio', async () => {
    mockApiGet.mockImplementation(async () => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true });
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><CalendarView initialAction={null} /></QueryClientProvider>);
    expect(await screen.findByText('Não foi possível carregar o calendário', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Sem conexão com o servidor/);
  });
});
