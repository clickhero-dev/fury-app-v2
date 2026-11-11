import { useState } from "react";

export const PAGE_SIZE = 10;

// Paginação na tela de uma lista já carregada
export function usePagination<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, totalPages);
  return {
    page: current,
    setPage,
    totalPages,
    pageItems: items.slice((current - 1) * size, current * size),
  };
}

interface Props {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

export function ListPagination({ page, totalPages, total, onChange }: Props) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
      <div>{total} {total === 1 ? "resultado" : "resultados"}</div>
      <div className="flex items-center gap-3">
        <div>Página {page} de {totalPages}</div>
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="ady-btn rounded-md border border-border px-3 py-1.5 text-text-primary disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="ady-btn rounded-md border border-border px-3 py-1.5 text-text-primary disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}
