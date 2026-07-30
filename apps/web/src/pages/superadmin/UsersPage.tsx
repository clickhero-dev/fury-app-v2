import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, Search, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  tenantId: string;
  tenantName: string | null;
  createdAt: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export function UsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = parseInt(searchParams.get("page") || "1");
  const currentSearch = searchParams.get("search") || "";

  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(currentSearch);

  const fetchUsers = useCallback(async (page: number, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "10");
      if (search) params.set("search", search);

      const res = await api.get(`/admin/users?${params.toString()}`);
      setData(res.data.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(currentPage, currentSearch);
  }, [currentPage, currentSearch, fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ search: searchInput, page: "1" });
  };

  const goToPage = (p: number) => {
    setSearchParams({ search: currentSearch, page: String(p) });
  };

  if (loading)
    return <div className="text-zinc-500 text-sm py-12 text-center">Carregando...</div>;

  const users = data?.users ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Users className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Usuários</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {data ? `${data.total} usuários` : "—"}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <form onSubmit={handleSearch}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome, email ou tenant..."
              className="w-80 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </form>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          Nenhum usuário encontrado
        </div>
      ) : (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-4 font-medium">Tenant</th>
                  <th className="px-5 py-4 font-medium">Nome</th>
                  <th className="px-5 py-4 font-medium">Email</th>
                  <th className="px-5 py-4 font-medium">Perfil</th>
                  <th className="px-5 py-4 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/tenants/${u.tenantId}`)}
                    className="text-zinc-300 hover:bg-zinc-800/50 cursor-pointer"
                  >
                    <td className="px-5 py-4 text-zinc-100 font-medium">
                      {u.tenantName ?? u.tenantId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">{u.name ?? "—"}</td>
                    <td className="px-5 py-4 text-zinc-400">{u.email}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === "owner" ? "bg-amber-900/30 text-amber-400"
                          : u.role === "admin" ? "bg-blue-900/30 text-blue-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-zinc-400">
              <span>
                Página {data.page} de {data.pages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(data.page - 1)}
                  disabled={data.page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToPage(data.page + 1)}
                  disabled={data.page >= data.pages}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
