import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Users, CreditCard, X, Trash2, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { getStoredPlatformRole } from "@/lib/platform-role";
import { apiMessage } from "./PartnersPage";

interface DeletedTenant {
  id: string;
  name: string;
  deletedAt: string;
  partnerName: string | null;
}

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
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");
  // excluídos e restaurar: só super_admin
  const isSuperAdmin = getStoredPlatformRole() === "super_admin";
  const [view, setView] = useState<"ativos" | "excluidos">("ativos");
  const [deleted, setDeleted] = useState<DeletedTenant[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  function loadDeleted() {
    api.get("/admin/deleted-tenants").then((res) => setDeleted(res.data.data)).catch(() => {});
  }

  async function handleRestore(t: DeletedTenant) {
    setRestoring(t.id);
    try {
      await api.post(`/admin/deleted-tenants/${t.id}/restore`);
      setDeleted((prev) => prev.filter((d) => d.id !== t.id));
      const res = await api.get("/admin/tenants");
      setTenants(res.data.data);
      setMsg(`Cliente "${t.name}" restaurado`);
    } catch (err) {
      setMsg(apiMessage(err, "Erro ao restaurar cliente"));
    } finally {
      setRestoring(null);
    }
  }

  useEffect(() => {
    api
      .get("/admin/tenants")
      .then((res) => { setTenants(res.data.data); })
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

  if (loading)
    return <div className="text-[#5A605C] text-sm">Carregando...</div>;

  return (
    <div>
      {msg && (
        <div className="mb-4 px-4 py-3 bg-[#161714] border border-[#2A2D27] rounded-lg text-sm text-[#ECEDEF] flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg("")} className="text-[#5A605C] hover:text-[#ECEDEF]">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(30,136,168,0.1)',
            border: '1px solid rgba(30,136,168,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#1E88A8', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold !text-[#ECEDEF]">Tenants</h1>
            <span className="text-sm text-[#5A605C]">{tenants.length} tenants</span>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5A605C]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tenant..."
            className="w-64 bg-[#161714] border border-[#2A2D27] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#ECEDEF] placeholder:text-[#5A605C] transition-colors hover:border-[#3A3D37] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30"
          />
        </div>
      </div>

      {isSuperAdmin && (
        <div role="group" aria-label="Filtro de clientes" className="inline-flex mb-4 rounded-lg border border-[#2A2D27] p-1 gap-1">
          {(["ativos", "excluidos"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => { setView(v); if (v === "excluidos") loadDeleted(); }}
              className={`px-3 py-1.5 rounded-md text-sm ${view === v ? "bg-[#1E88A8]/20 text-[#ECEDEF] font-medium" : "text-[#7E8480] hover:text-[#ECEDEF]"}`}
            >
              {v === "ativos" ? "Ativos" : "Excluídos"}
            </button>
          ))}
        </div>
      )}

      {view === "excluidos" && (
        <div className="grid gap-3">
          {deleted.length === 0 && (
            <div className="text-center py-12 text-[#5A605C] text-sm">Nenhum cliente excluído</div>
          )}
          {deleted.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-[#161714] border border-[#2A2D27] rounded-lg p-5">
              <div>
                <div className="font-semibold text-[#ECEDEF]">{t.name}</div>
                <div className="text-xs text-[#5A605C] mt-0.5">
                  {t.partnerName ? `Parceiro ${t.partnerName}` : "Cliente ady"} · excluído em {new Date(t.deletedAt).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <button
                onClick={() => handleRestore(t)}
                disabled={restoring === t.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#2A2D27] text-sm text-[#ECEDEF] hover:border-[#1E88A8]/40 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" /> {restoring === t.id ? "Restaurando..." : "Restaurar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {view === "ativos" && (
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#5A605C] text-sm">
            Nenhum tenant encontrado
          </div>
        )}
        {filtered.map((tenant) => (
          <div
            key={tenant.id}
            onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
            className="flex items-center justify-between bg-[#161714] border border-[#2A2D27] rounded-lg p-5 hover:border-[#1E88A8]/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#1A1C18] border border-[#1E88A8]/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#1E88A8]" />
              </div>
              <div>
                <div className="font-semibold text-[#ECEDEF]">{tenant.name}</div>
                <div className="text-xs text-[#5A605C] mt-0.5">{tenant.slug}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-xs text-[#7E8480]">
                <Users className="w-3.5 h-3.5" />
                {tenant.userCount}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#7E8480]">
                <CreditCard className="w-3.5 h-3.5" />
                {tenant.subscription?.plan?.name ?? "Sem plano"}
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                tenant.subscription?.status === "active"
                  ? "bg-[#1E88A8]/20 text-[#1E88A8]"
                  : tenant.subscription?.status === "trial"
                    ? "bg-[#CF6F03]/20 text-[#CF6F03]"
                    : tenant.subscription?.status === "inactive"
                      ? "bg-[#CF6F03]/20 text-[#CF6F03]"
                      : "bg-[#1A1C18] text-[#5A605C]"
              }`}>
                {tenant.subscription?.status ?? "inactive"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(tenant); }}
                className="w-8 h-8 flex items-center justify-center leading-none rounded-lg bg-[#C0392B]/20 text-[#C0392B] hover:bg-[#C0392B]/30 transition-all shrink-0"
                title="Deletar tenant"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Deletar Tenant Confirmação */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-[#161714] border border-[#2A2D27] rounded-lg p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-[#ECEDEF]">Deletar Tenant</h2>
              <button onClick={() => setDeleteTarget(null)} className="text-[#5A605C] hover:text-[#ECEDEF] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-[#5A605C] mb-2">
              Tem certeza que deseja deletar{" "}
              <strong className="text-[#ECEDEF]">{deleteTarget.name}</strong>?
            </p>
            <p className="text-xs text-[#3E4440] mb-6">
              O cliente e os usuários dele perdem o acesso na hora. Os dados ficam guardados e o super admin pode restaurar.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-[#161714] hover:bg-[#1A1C18] border border-[#2A2D27] text-[#7E8480] py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={deleting}
                className="flex-1 bg-[#C0392B] hover:bg-[#A93225] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {deleting ? "Deletando..." : <><Trash2 className="w-4 h-4" /> Sim, deletar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}