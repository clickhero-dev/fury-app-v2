import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Plus, X } from "lucide-react";
import { isAxiosError } from "axios";
import api from "@/lib/api";

export interface Partner {
  id: string;
  name: string;
  maxTenants: number;
  usedTenants: number;
  accountEmail: string | null;
  keyLast4: string | null;
}

const EMPTY_FORM = { name: "", maxTenants: 10, accountName: "", accountEmail: "", accountPassword: "" };

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function apiMessage(err: unknown, fallback: string) {
  return isAxiosError(err) ? err.response?.data?.error?.message ?? fallback : fallback;
}

export function SlotsBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-28 rounded-full bg-surface-secondary overflow-hidden" aria-hidden="true">
      <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    api
      .get("/admin/partners")
      .then((res) => setPartners(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/admin/partners", form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(apiMessage(err, "Não foi possível criar o parceiro."));
    } finally {
      setSaving(false);
    }
  }

  const used = partners.reduce((s, p) => s + p.usedTenants, 0);
  const max = partners.reduce((s, p) => s + p.maxTenants, 0);

  if (loading) return <div className="text-text-tertiary text-sm">Carregando...</div>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center text-[#17708A] dark:text-[#1E88A8]">
            <Briefcase className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Parceiros</h1>
            <p className="text-sm text-text-secondary">Empresas parceiras e quantos clientes cada uma pode ter.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/parceiros/padrao"
          className="px-4 py-2.5 rounded-full border border-border-light bg-surface-secondary text-text-primary hover:border-brand/50 font-semibold transition-colors text-sm"
        >
          Permissões padrão (todos)
        </Link>
        <button
          onClick={() => { setError(""); setShowModal(true); }}
          className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo parceiro
        </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[
          { label: "Parceiros ativos", value: String(partners.length) },
          { label: "Vagas usadas", value: `${used} de ${max}` },
          { label: "Clientes de parceiros", value: String(used) },
        ].map((k) => (
          <div key={k.label} className="bg-surface border border-border rounded-2xl p-5">
            <div className="text-sm text-text-secondary">{k.label}</div>
            <div className="text-2xl font-bold text-text-primary mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-text-secondary border-b border-border">
              <th className="px-4 py-3 font-medium">Parceiro</th>
              <th className="px-4 py-3 font-medium">Vagas</th>
              <th className="px-4 py-3 font-medium">Chave OpenRouter</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-text-tertiary">Nenhum parceiro cadastrado</td></tr>
            )}
            {partners.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-text-primary">{p.name}</div>
                  <div className="text-xs text-text-tertiary">{p.accountEmail ?? "Sem conta"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 text-text-primary">
                    <SlotsBar used={p.usedTenants} max={p.maxTenants} />
                    {p.usedTenants} de {p.maxTenants}
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{p.keyLast4 ? `•••• ${p.keyLast4}` : "Sem chave"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/admin/parceiros/${p.id}`}
                    className="inline-flex items-center px-3.5 py-2 rounded-full border border-border-light bg-surface-secondary text-text-primary hover:border-brand/50 font-semibold transition-colors text-xs"
                  >
                    Configurar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <form onSubmit={handleCreate} className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Novo parceiro</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Fechar" className="ady-btn text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Nome da empresa</span>
              <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Máximo de clientes</span>
              <input required type="number" min={0} className={inputCls} value={form.maxTenants}
                onChange={(e) => setForm({ ...form, maxTenants: Number(e.target.value) })} />
            </label>
            <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Conta do parceiro</div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Nome</span>
              <input required className={inputCls} value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">E-mail</span>
              <input required type="email" className={inputCls} value={form.accountEmail} onChange={(e) => setForm({ ...form, accountEmail: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Senha inicial (mínimo 8 caracteres)</span>
              <input required type="password" minLength={8} className={inputCls} value={form.accountPassword}
                onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} />
            </label>
            {error && <div role="alert" className="text-sm text-error">{error}</div>}
            <button type="submit" disabled={saving}
              className="w-full ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors py-2.5">
              {saving ? "Criando..." : "Criar parceiro"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
