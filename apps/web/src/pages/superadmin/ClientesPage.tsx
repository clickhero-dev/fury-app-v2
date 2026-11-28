import { PasswordInput } from '@/components/ui/password-input';
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, X } from "lucide-react";
import api from "@/lib/api";
import { apiMessage, SlotsBar } from "./PartnersPage";
import { statusLabel } from "./subscriptionLabels";

interface Slots {
  maxTenants: number;
  usedTenants: number;
}

interface Client {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
  subscription?: { status: string; plan: { name: string } | null } | null;
}

type Sort = "recent" | "oldest" | "name" | "users";
const SORTS: Array<[Sort, string]> = [["recent", "Mais recentes"], ["oldest", "Mais antigos"], ["name", "Nome (A–Z)"], ["users", "Mais usuários"]];
const NO_SUB = "__none";
const filterCls = "bg-surface border border-border rounded-full px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

interface PlanOption {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

const EMPTY_FORM = { name: "", userName: "", userEmail: "", userPassword: "", planId: "" };

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

// Clientes do parceiro logado: vagas + Novo Cliente
export function ClientesPage() {
  const [slots, setSlots] = useState<Slots | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const load = () =>
    Promise.all([api.get("/admin/my-partner"), api.get("/admin/tenants"), api.get("/admin/plans")])
      .then(([s, t, p]) => {
        setSlots(s.data.data);
        setClients(t.data.data);
        // só os ativos, do mais antigo para o mais novo
        setPlans((p.data.data as PlanOption[]).filter((x) => x.isActive).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      })
      .catch((err) => setError(apiMessage(err, "Não foi possível carregar os clientes.")));

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { planId, ...rest } = form;
      await api.post("/admin/my-partner/clients", planId ? form : rest);
      setShowModal(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(apiMessage(err, "Não foi possível criar o cliente."));
    } finally {
      setSaving(false);
    }
  }

  if (!slots) return error ? <div role="alert" className="text-sm text-error">{error}</div> : <div className="text-text-tertiary text-sm">Carregando...</div>;

  const full = slots.usedTenants >= slots.maxTenants;
  // filtros na lista que já veio só com os clientes do parceiro
  const statusOptions = [...new Set(clients.map((c) => c.subscription?.status).filter((v): v is string => Boolean(v)))].sort();
  const planOptions = [...new Set(clients.map((c) => c.subscription?.plan?.name).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const term = search.trim().toLowerCase();
  const shown = clients
    .filter((c) => !term || c.name.toLowerCase().includes(term))
    .filter((c) => !statusFilter || (statusFilter === NO_SUB ? !c.subscription : c.subscription?.status === statusFilter))
    .filter((c) => !planFilter || (planFilter === NO_SUB ? !c.subscription?.plan : c.subscription?.plan?.name === planFilter))
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "pt-BR")
      : sort === "users" ? b.userCount - a.userCount
      : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt));
  const hasFilters = Boolean(term || statusFilter || planFilter || sort !== "recent");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center text-[#17708A] dark:text-[#1E88A8]">
            <Building2 className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Clientes</h1>
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <SlotsBar used={slots.usedTenants} max={slots.maxTenants} />
              <span>{slots.usedTenants} de {slots.maxTenants} vagas</span>
            </div>
          </div>
        </div>
        <button
          disabled={full}
          onClick={() => { setError(""); setForm({ ...EMPTY_FORM, planId: plans[0]?.id ?? "" }); setShowModal(true); }}
          className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo Cliente
        </button>
      </div>

      {full && (
        <div className="mb-4 text-sm text-error">
          Limite de clientes atingido ({slots.usedTenants} de {slots.maxTenants}). Fale com a ady para aumentar.
        </div>
      )}
      {error && !showModal && <div role="alert" className="mb-4 text-sm text-error">{error}</div>}

      <div role="group" aria-label="Filtros de clientes" className="flex flex-wrap items-center gap-3 mb-4">
        <input type="search" aria-label="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className={`${filterCls} w-56 placeholder:text-text-tertiary`} />
        <select aria-label="Filtrar por situação" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterCls}>
          <option value="">Todas as situações</option>
          {statusOptions.map((v) => <option key={v} value={v}>{statusLabel(v)}</option>)}
          <option value={NO_SUB}>Sem assinatura</option>
        </select>
        <select aria-label="Filtrar por plano" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={`${filterCls} max-w-[16rem] truncate`}>
          <option value="">Todos os planos</option>
          {planOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          <option value={NO_SUB}>Sem plano</option>
        </select>
        <select aria-label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={filterCls}>
          {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        {hasFilters && (
          <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setPlanFilter(""); setSort("recent"); }} className="ady-btn rounded-full border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-secondary transition-colors">
            Limpar filtros
          </button>
        )}
        <div className="text-xs text-text-tertiary">{shown.length} de {clients.length}</div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-text-secondary border-b border-border">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Usuários</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-text-tertiary">{clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado para os filtros selecionados"}</td></tr>
            )}
            {shown.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/admin/tenants/${c.id}`} className="font-semibold text-text-primary hover:text-[#17708A] dark:hover:text-[#1E88A8]">{c.name}</Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">{c.subscription?.plan?.name ?? "Sem plano"}</td>
                <td className="px-4 py-3 text-text-secondary">{c.subscription ? statusLabel(c.subscription.status) : "Sem assinatura"}</td>
                <td className="px-4 py-3 text-text-primary">{c.userCount}</td>
                <td className="px-4 py-3 text-text-secondary">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <form onSubmit={handleCreate} className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Novo Cliente</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Fechar" className="ady-btn text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Nome da empresa</span>
              <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Usuário titular</div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Nome</span>
              <input required className={inputCls} value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">E-mail</span>
              <input required type="email" className={inputCls} value={form.userEmail} onChange={(e) => setForm({ ...form, userEmail: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Senha inicial (mínimo 8 caracteres)</span>
              <PasswordInput required minLength={8} className={inputCls} value={form.userPassword}
                onChange={(e) => setForm({ ...form, userPassword: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Plano</span>
              <select className={inputCls} value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">Sem plano (atribuir depois)</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!form.planId && <span className="block text-xs text-text-secondary">Sem plano, o cliente só entra no app depois que você atribuir um.</span>}
            </label>
            {error && <div role="alert" className="text-sm text-error">{error}</div>}
            <button type="submit" disabled={saving}
              className="w-full ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors py-2.5">
              {saving ? "Criando..." : "Criar cliente"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
