import { ChevronLeft, ChevronRight } from "lucide-react";

interface UserPagerProps {
  total: number;
  page: number;
  perPage: number;
  onChange: (page: number) => void;
}

const pgCls =
  "ady-btn min-w-9 h-9 px-2.5 flex items-center justify-center rounded-lg border text-sm font-semibold tabular-nums transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

// Paginação da lista de usuários
export function UserPager({ total, page, perPage, onChange }: UserPagerProps) {
  if (total <= perPage) return null;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const idle = "border-admin-border bg-admin-surface text-admin-text-muted hover:border-admin-petrol hover:text-admin-petrol";

  return (
    <nav aria-label="Paginação de usuários" className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-admin-text-muted tabular-nums">Mostrando {start}–{end} de {total}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)} className={`${pgCls} ${idle}`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => onChange(n)}
            className={`${pgCls} ${n === page ? "bg-[#17708A] border-[#17708A] text-white" : idle}`}
          >
            {n}
          </button>
        ))}
        <button type="button" aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)} className={`${pgCls} ${idle}`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
