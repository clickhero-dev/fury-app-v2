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

  // Create modal
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

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Delete
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

  // ── Validators ──────────────────────────────────

  function validateTenantName(v: string) {
    if (!v.trim()) return "Nome do tenant é obrigatório";
    if (tenants.some((t) => t.name.toLowerCase() === v.trim().toLowerCase()))
      return "Este nome já está em uso";
    return "";
  }

  function validateUserName(v: string) {
    if (!v.trim()) return "Nome do usuário é obrigatório";
    return "";
  }

  function validateEmail(v: string) {
    if (!v.trim()) return "Email é obrigatório";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Email inválido";
    return "";
  }

  function validatePassword(v: string) {
    if (!v) return "Senha é obrigatória";
    if (v.length < 8) return "Mínimo 8 caracteres";
    if (!/[A-Z]/.test(v)) return "Precisa de letra maiúscula";
    if (!/[a-z]/.test(v)) return "Precisa de letra minúscula";
    if (!/[0-9]/.test(v)) return "Precisa de número";
    if (!/[^A-Za-z0-9]/.test(v)) return "Precisa de caractere especial";
    return "";
  }

  const fieldValidators: Record<
    string,
    (v: string) => string
  > = {
    tenantName: validateTenantName,
    userName: validateUserName,
    userEmail: validateEmail,
    userPassword: validatePassword,
  };

  function validateAll() {
    const next: Record<string, string> = {};
    for (const [field, fn] of Object.entries(fieldValidators)) {
      const err = fn(form[field as keyof typeof form]);
      if (err) next[field] = err;
    }
    setErrors(next);
    setTouched({
      tenantName: true,
      userName: true,
      userEmail: true,
      userPassword: true,
    });
    return Object.keys(next).length === 0;
  }

  function handleBlur(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const fn = fieldValidators[field];
    if (fn) {
      setErrors((prev) => ({ ...prev, [field]: fn(form[field as keyof typeof form]) }));
    }
  }

  async function handleEmailBlur() {
    setTouched((prev) => ({ ...prev, userEmail: true }));
    const formatErr = validateEmail(form.userEmail);
    if (formatErr) {
      setErrors((prev) => ({ ...prev, userEmail: formatErr }));
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await api.get(
        `/admin/users/check-email/${encodeURIComponent(form.userEmail)}`,
      );
      if (res.data?.data?.exists) {
        setErrors((prev) => ({ ...prev, userEmail: "Este email já está em uso" }));
      } else {
        setErrors((prev) => ({ ...prev, userEmail: "" }));
      }
    } catch {
      // fallback silencioso — a API valida no submit
    } finally {
      setCheckingEmail(false);
    }
  }

  // ── Derived state ──────────────────────────────

  const nameExists =
    form.tenantName.trim() &&
    tenants.some(
      (t) => t.name.toLowerCase() === form.tenantName.trim().toLowerCase(),
    );

  const nameSuggestion = nameExists
    ? (() => {
        const base = form.tenantName.trim();
        const similar = tenants.filter((t) =>
          t.name.toLowerCase().startsWith(base.toLowerCase()),
        ).length;
        return `${base} ${similar + 1}`;
      })()
    : null;

  const isFormValid =
    form.tenantName.trim() !== "" &&
    form.userName.trim() !== "" &&
    form.userEmail.trim() !== "" &&
    form.userPassword !== "" &&
    !errors.tenantName &&
    !errors.userName &&
    !errors.userEmail &&
    !errors.userPassword;

  // ── Password strength ──────────────────────────

  const passwordChecks = form.userPassword
    ? [
        form.userPassword.length >= 8,
        /[A-Z]/.test(form.userPassword),
        /[a-z]/.test(form.userPassword),
        /[0-9]/.test(form.userPassword),
        /[^A-Za-z0-9]/.test(form.userPassword),
      ]
    : null;

  // ── Actions ────────────────────────────────────

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
    if (!validateAll()) return;
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
      setErrors({});
      setTouched({});
      navigate(`/admin/tenants/${res.data.data.tenant.id}`);
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Erro ao criar cliente",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────

  if (loading)
    return <div className="text-zinc-500 text-sm">Carregando...</div>;

  const inputCls =
    "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30";
  const inputErrorCls =
    "w-full bg-zinc-800 border border-red-500/50 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/30";
  const labelCls = "block text-xs font-medium text-zinc-400 mb-1.5";
  const btnCancelCls =
    "flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2.5 rounded-xl text-sm font-medium transition-colors";
  const btnCls =
    "flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors";

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
              setErrors({});
              setTouched({});
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
              {/* Tenant Name */}
              <div>
                <label className={labelCls}>Nome do Tenant</label>
                <input
                  value={form.tenantName}
                  onChange={(e) => {
                    setForm({ ...form, tenantName: e.target.value });
                    if (errors.tenantName) setErrors((p) => ({ ...p, tenantName: "" }));
                  }}
                  onBlur={() => handleBlur("tenantName")}
                  placeholder="Ex: João Silva Empreendimentos"
                  className={touched.tenantName && errors.tenantName ? inputErrorCls : inputCls}
                />
                {touched.tenantName && errors.tenantName && (
                  <p className="mt-1 text-xs text-red-400">{errors.tenantName}</p>
                )}
                {nameSuggestion && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...form, tenantName: nameSuggestion });
                      if (errors.tenantName) setErrors((p) => ({ ...p, tenantName: "" }));
                    }}
                    className="mt-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Sugestão: <strong>{nameSuggestion}</strong>
                  </button>
                )}
              </div>

              {/* User Name */}
              <div>
                <label className={labelCls}>Nome do Usuário</label>
                <input
                  value={form.userName}
                  onChange={(e) => {
                    setForm({ ...form, userName: e.target.value });
                    if (errors.userName) setErrors((p) => ({ ...p, userName: "" }));
                  }}
                  onBlur={() => handleBlur("userName")}
                  placeholder="Nome do usuário"
                  className={touched.userName && errors.userName ? inputErrorCls : inputCls}
                />
                {touched.userName && errors.userName && (
                  <p className="mt-1 text-xs text-red-400">{errors.userName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className={labelCls}>Email</label>
                <div className="relative">
                  <input
                    value={form.userEmail}
                    onChange={(e) => {
                      setForm({ ...form, userEmail: e.target.value });
                      if (errors.userEmail) setErrors((p) => ({ ...p, userEmail: "" }));
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="email@exemplo.com"
                    type="email"
                    className={
                      touched.userEmail && errors.userEmail ? inputErrorCls : inputCls
                    }
                  />
                  {checkingEmail && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {touched.userEmail && errors.userEmail && (
                  <p className="mt-1 text-xs text-red-400">{errors.userEmail}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className={labelCls}>Senha</label>
                <input
                  value={form.userPassword}
                  onChange={(e) => {
                    setForm({ ...form, userPassword: e.target.value });
                    if (errors.userPassword) setErrors((p) => ({ ...p, userPassword: "" }));
                  }}
                  onBlur={() => handleBlur("userPassword")}
                  placeholder="Mínimo 8 caracteres"
                  type="password"
                  className={
                    touched.userPassword && errors.userPassword ? inputErrorCls : inputCls
                  }
                />
                {touched.userPassword && errors.userPassword && (
                  <p className="mt-1 text-xs text-red-400">{errors.userPassword}</p>
                )}
                {passwordChecks && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {passwordChecks.map((ok, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          ok ? "bg-amber-500" : "bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Role */}
              <div>
                <label className={labelCls}>Perfil</label>
                <select
                  value={form.userRole}
                  onChange={(e) => setForm({ ...form, userRole: e.target.value })}
                  className={inputCls}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Membro</option>
                </select>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-xl">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className={btnCancelCls}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateTenant}
                  disabled={saving || !isFormValid}
                  className={btnCls}
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
                className={btnCancelCls}
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
