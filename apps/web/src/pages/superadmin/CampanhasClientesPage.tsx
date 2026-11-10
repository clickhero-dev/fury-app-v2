import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { ListPagination, usePagination } from "./ListPagination";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// Escolhe o cliente e abre direto as campanhas dele
export function CampanhasClientesPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/tenants");
        setTenants(res.data.data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const term = search.toLowerCase();
  const filtered = tenants.filter(
    (t) => t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term),
  );

  const paged = usePagination(filtered);

  if (loading) return <div className="text-text-tertiary text-sm">Carregando...</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Campanhas</h1>
          <div className="text-sm text-text-tertiary mt-1">Escolha o cliente para ver as campanhas</div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); paged.setPage(1); }}
            placeholder="Buscar cliente..."
            aria-label="Buscar cliente"
            className="w-64 bg-surface border border-border rounded-full pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors hover:border-border-light focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {error && <div className="text-center py-12 text-error text-sm">Erro ao carregar clientes</div>}

      {!error && (
        <div className="grid gap-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-text-tertiary text-sm">Nenhum cliente encontrado</div>
          )}
          {paged.pageItems.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              onClick={() => navigate(`/admin/tenants/${tenant.id}/campaigns`)}
              className="ady-btn w-full text-left flex items-center justify-between bg-surface border border-border rounded-2xl p-5 hover:border-brand/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-brand/20 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <div className="font-semibold text-text-primary">{tenant.name}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">{tenant.slug}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-text-tertiary" />
            </button>
          ))}
          <ListPagination page={paged.page} totalPages={paged.totalPages} total={filtered.length} onChange={paged.setPage} />
        </div>
      )}
    </div>
  );
}
