import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ListPagination, usePagination } from './ListPagination';

function Lista({ total }: { total: number }) {
  const items = Array.from({ length: total }, (_, i) => `Item ${i + 1}`);
  const paged = usePagination(items);
  return (
    <div>
      {paged.pageItems.map((i) => <div key={i}>{i}</div>)}
      <ListPagination page={paged.page} totalPages={paged.totalPages} total={items.length} onChange={paged.setPage} />
    </div>
  );
}

describe('ListPagination', () => {
  it('mostra 10 por página e navega', () => {
    render(<Lista total={23} />);
    expect(screen.getByText('Item 10')).toBeInTheDocument();
    expect(screen.queryByText('Item 11')).toBeNull();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getByText('Item 23')).toBeInTheDocument();
    expect(screen.queryByText('Item 20')).toBeNull();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('some com uma página só', () => {
    render(<Lista total={10} />);
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });
});
