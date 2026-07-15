import { useEffect, useState } from "react";
import { Users } from "lucide-react";
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

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/users")
      .then((res) => setUsers(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="text-zinc-500 text-sm py-12 text-center">Carregando...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
          <Users className="w-5 h-5 text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Usuários</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} usuários</p>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">Nenhum usuário encontrado</div>
      ) : (
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
                <tr key={u.id} className="text-zinc-300 hover:bg-zinc-800/50">
                  <td className="px-5 py-4 text-zinc-100 font-medium">{u.tenantName ?? u.tenantId.slice(0, 8)}</td>
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
      )}
    </div>
  );
}
