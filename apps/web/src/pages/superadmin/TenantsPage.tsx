import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Building2,
  Users,
  CreditCard,
  UserPlus,
  X,
  Trash2,
} from "lucide-react";
import api from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  userCount: number;
  subscription: {
    status: string;
    currentPeriodEnd: string;
    plan: { name: string } | null;
  } | null;
}

export function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Create tenant + user modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tenantName: "",
    userName: "",
    userEmail: "",
    userPassword: "",
    userRole: "owner",
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .get("/admin/tenants")
      .then((res) => {
        setTenants(res.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDeleteTenant() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/tenants/${deleteTarget.id}`);
      setTenants((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setMsg(`Tenant "${deleteTarget.name}" deletado`);
      setDeleteTarget(null);
    } catch {
      setMsg("Erro ao deletar tenant");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateTenant() {
    if (
      !form.tenantName ||
      !form.userName ||
      !form.userEmail ||
      !form.userPassword
    ) {
      setError("Preencha todos os campos");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/admin/setup-tenant", {
        name: form.tenantName,
        userName: form.userName,
        userEmail: form.userEmail,
        userPassword: form.userPassword,
        userRole: form.userRole,
      });
      setShowModal(false);
      setForm({
        tenantName: "",
        userName: "",
        userEmail: "",
        userPassword: "",
        userRole: "owner",
      });
      navigate(`/admin/tenants/${res.data.data.tenant.id}`);
    } catch {
      setError("Erro ao criar cliente");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <div className="text-zinc-500 text-sm">Carregando...</div>;

  const inputCls =
    "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30";

  return (
    <div>
      {msg && (
        <div className="mb-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 flex items-center justify-between">
          {msg}
          <button
            onClick={() => setMsg("")}
            className="text-zinc-500 hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Tenants</h1>
          <p className="text-sm text-zinc-500 mt-1">{tenants.length} tenants</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setForm({
                tenantName: "",
                userName: "",
                userEmail: "",
                userPassword: "",
                userRole: "owner",
              });
              setError("");
              setShowModal(true);
            }}
            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Novo Cliente
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tenant..."
              className="w-64 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">
            Nenhum tenant encontrado
          </div>
        )}
        {filtered.map((tenant) => (
          <div key={tenant.id} className="relative group">
            <button
              onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
              className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-100">
                      {tenant.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {tenant.slug}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Users className="w-3.5 h-3.5" />
                    {tenant.userCount}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <CreditCard className="w-3.5 h-3.5" />
                    {tenant.subscription?.plan?.name ?? "Sem plano"}
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      tenant.subscription?.status === "active"
                        ? "bg-green-900/30 text-green-400"
                        : tenant.subscription?.status === "trial"
                          ? "bg-blue-900/30 text-blue-400"
                          : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {tenant.subscription?.status ?? "inactive"}
                  </span>
                </div>
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(tenant);
              }}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-red-900/30 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-900/50 transition-all"
              title="Deletar tenant"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Novo Cliente Modal ───────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-zinc-100">
                Novo Cliente
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nome do Tenant
                </label>
                <input
                  value={form.tenantName}
                  onChange={(e) =>
                    setForm({ ...form, tenantName: e.target.value })
                  }
                  placeholder="Ex: João Silva Empreendimentos"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nome do Usuário
                </label>
                <input
                  value={form.userName}
                  onChange={(e) =>
                    setForm({ ...form, userName: e.target.value })
                  }
                  placeholder="Nome do usuário"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Email
                </label>
                <input
                  value={form.userEmail}
                  onChange={(e) =>
                    setForm({ ...form, userEmail: e.target.value })
                  }
                  placeholder="email@exemplo.com"
                  type="email"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Senha
                </label>
                <input
                  value={form.userPassword}
                  onChange={(e) =>
                    setForm({ ...form, userPassword: e.target.value })
                  }
                  placeholder="Mínimo 8 caracteres"
                  type="password"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Perfil
                </label>
                <select
                  value={form.userRole}
                  onChange={(e) =>
                    setForm({ ...form, userRole: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Membro</option>
                </select>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateTenant}
                  disabled={saving}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {saving ? (
                    "Criando..."
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" /> Criar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deletar Tenant Confirmação ────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-zinc-100">
                Deletar Tenant
              </h2>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-zinc-400 mb-2">
              Tem certeza que deseja deletar{" "}
              <strong className="text-zinc-200">{deleteTarget.name}</strong>?
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              Esta ação remove todos os dados do tenant, incluindo usuários,
              campanhas e assinaturas. Não é reversível.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={deleting}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {deleting ? (
                  "Deletando..."
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Sim, deletar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
