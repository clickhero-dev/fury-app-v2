import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, Search, ChevronLeft, ChevronRight, UserPlus, X } from "lucide-react";
import api from "@/lib/api";
import { getStoredPlatformRole, roleBadgeClass, roleLabel } from "@/lib/platform-role";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  platformRole?: string | null;
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [checkingEmail, setCheckingEmail] = useState(false);

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

  // Validators
  function validateTenantName(v: string) {
    if (!v.trim()) return "Nome do cliente é obrigatório";
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

  const fieldValidators: Record<string, (v: string) => string> = {
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
      // fallback silencioso
    } finally {
      setCheckingEmail(false);
    }
  }

  const isFormValid =
    form.tenantName.trim() !== "" &&
    form.userName.trim() !== "" &&
    form.userEmail.trim() !== "" &&
    form.userPassword !== "" &&
    !errors.tenantName &&
    !errors.userName &&
    !errors.userEmail &&
    !errors.userPassword;

  const passwordChecks = form.userPassword
    ? [
        form.userPassword.length >= 8,
        /[A-Z]/.test(form.userPassword),
        /[a-z]/.test(form.userPassword),
        /[0-9]/.test(form.userPassword),
        /[^A-Za-z0-9]/.test(form.userPassword),
      ]
    : null;

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
      const apiError = (err as {
        response?: { data?: { error?: { code?: string } } };
      })?.response?.data?.error;
      setError(
        apiError?.code === "SLUG_EXISTS"
          ? "Já existe um cliente com este identificador. Altere o nome ou verifique os clientes cadastrados."
          : apiError?.code === "EMAIL_EXISTS"
            ? "Este email já está em uso."
            : "Não foi possível criar o cliente. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <div className="text-text-tertiary text-sm py-12 text-center">Carregando...</div>;

  const users = data?.users ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-[#17708A] dark:text-[#1E88A8]" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold text-text-primary">Usuários</h1>
            <p className="text-sm text-text-tertiary">
              {data ? `${data.total} usuários` : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* novo cliente (setup-tenant): só super_admin por enquanto */}
          {getStoredPlatformRole() === "super_admin" && (
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
            className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5 flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" strokeWidth={2.5} /> Novo Cliente
          </button>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" strokeWidth={2} />
            <form onSubmit={handleSearch}>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nome, e-mail ou cliente..."
                className="w-80 bg-surface border border-border rounded-full pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-colors"
              />
            </form>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary text-sm">
          Nenhum usuário encontrado
        </div>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-tertiary text-xs uppercase tracking-wider font-medium">
                  <th className="px-5 py-4">Cliente</th>
                  <th className="px-5 py-4">Nome</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Cargo</th>
                  <th className="px-5 py-4">Criado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/tenants/${u.tenantId}`)}
                    className="hover:bg-surface-secondary cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-4 text-text-primary font-semibold">
                      {u.tenantName ?? u.tenantId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{u.name ?? "—"}</td>
                    <td className="px-5 py-4 text-text-tertiary">{u.email}</td>
                    <td className="px-5 py-4">
                      <div className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeClass(u)}`}>{roleLabel(u)}</div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-text-tertiary">
                      {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-text-tertiary">
              <span>
                Página <strong className="text-text-primary">{data.page}</strong> de {data.pages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(data.page - 1)}
                  disabled={data.page <= 1}
                  className="ady-btn p-1.5 rounded-full bg-surface border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToPage(data.page + 1)}
                  disabled={data.page >= data.pages}
                  className="ady-btn p-1.5 rounded-full bg-surface border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">
                Novo Cliente
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="ady-btn text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Tenant Name */}
              <div>
                <label htmlFor="setup-tenant-name" className="block text-xs font-medium text-admin-text-muted mb-1.5">
                  Nome do cliente
                </label>
                <input
                  id="setup-tenant-name"
                  value={form.tenantName}
                  onChange={(e) => {
                    setForm({ ...form, tenantName: e.target.value });
                    if (errors.tenantName) setErrors((p) => ({ ...p, tenantName: "" }));
                  }}
                  onBlur={() => handleBlur("tenantName")}
                  placeholder="Ex: João Silva Empreendimentos"
                  className={
                    touched.tenantName && errors.tenantName
                      ? "w-full bg-admin-bg border border-error/50 rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-error/30"
                      : "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                  }
                />
                {touched.tenantName && errors.tenantName && (
                  <div className="mt-1 text-xs text-error">{errors.tenantName}</div>
                )}
              </div>

              {/* User Name */}
              <div>
                <label htmlFor="setup-user-name" className="block text-xs font-medium text-admin-text-muted mb-1.5">
                  Nome do Usuário
                </label>
                <input
                  id="setup-user-name"
                  value={form.userName}
                  onChange={(e) => {
                    setForm({ ...form, userName: e.target.value });
                    if (errors.userName) setErrors((p) => ({ ...p, userName: "" }));
                  }}
                  onBlur={() => handleBlur("userName")}
                  placeholder="Nome do usuário"
                  className={
                    touched.userName && errors.userName
                      ? "w-full bg-admin-bg border border-error/50 rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-error/30"
                      : "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                  }
                />
                {touched.userName && errors.userName && (
                  <div className="mt-1 text-xs text-error">{errors.userName}</div>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="setup-user-email" className="block text-xs font-medium text-admin-text-muted mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <input
                    id="setup-user-email"
                    value={form.userEmail}
                    onChange={(e) => {
                      setForm({ ...form, userEmail: e.target.value });
                      if (errors.userEmail) setErrors((p) => ({ ...p, userEmail: "" }));
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="email@exemplo.com"
                    type="email"
                    className={
                      touched.userEmail && errors.userEmail
                        ? "w-full bg-admin-bg border border-error/50 rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-error/30"
                        : "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                    }
                  />
                  {checkingEmail && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-admin-text-faint border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {touched.userEmail && errors.userEmail && (
                  <div className="mt-1 text-xs text-error">{errors.userEmail}</div>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="setup-user-password" className="block text-xs font-medium text-admin-text-muted mb-1.5">
                  Senha
                </label>
                <input
                  id="setup-user-password"
                  value={form.userPassword}
                  onChange={(e) => {
                    setForm({ ...form, userPassword: e.target.value });
                    if (errors.userPassword) setErrors((p) => ({ ...p, userPassword: "" }));
                  }}
                  onBlur={() => handleBlur("userPassword")}
                  placeholder="Mínimo 8 caracteres"
                  type="password"
                  className={
                    touched.userPassword && errors.userPassword
                      ? "w-full bg-admin-bg border border-error/50 rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-error/30"
                      : "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                  }
                />
                {touched.userPassword && errors.userPassword && (
                  <div className="mt-1 text-xs text-error">{errors.userPassword}</div>
                )}
                {passwordChecks && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {passwordChecks.map((ok, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          ok ? "bg-brand" : "bg-admin-border"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-admin-text-muted mb-1.5">
                  Cargo
                </label>
                <select
                  value={form.userRole}
                  onChange={(e) => setForm({ ...form, userRole: e.target.value })}
                  className="w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                >
                  <option value="owner">Usuário Titular</option>
                  <option value="admin">Administrador</option>
                  <option value="member">Usuário</option>
                </select>
              </div>

              {error && (
                <div className="text-sm text-error bg-error/10 px-3 py-2 rounded-xl">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateTenant}
                  disabled={saving || !isFormValid}
                  className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm rounded-full text-sm font-semibold transition-colors flex-1 py-2.5 flex items-center justify-center gap-2"
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
    </div>
  );
}
