import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  UserPlus,
  Upload,
  X,
  Image as ImageIcon,
  MapPin,
  Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { useMetaLocations } from "@/components/campaign-wizard/hooks/useMetaLocations";
import { FURY_COLORS } from "@/lib/constants";

type Tab =
  "users" | "subscription" | "config" | "metas" | "publico" | "brandkit";

interface TenantData {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  }[];
  subscription: {
    id: string;
    planId: string;
    status: string;
    trialEndsAt: string;
    currentPeriodEnd: string;
    asaasSubscriptionId: string;
    plan: {
      id: string;
      name: string;
      priceCents: number;
      interval: string;
    } | null;
  } | null;
  furyConfig: {
    id: string;
    targetRoas: string;
    targetCpa: string;
    targetCtr: string;
    targetBudgetUtilization: string;
  } | null;
  brandKit: {
    id: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    voiceTone: string;
    photoUrls: string[];
  } | null;
  goals: {
    id: string;
    objective: string;
    niche: string;
    mainProduct: string;
    monthlyBudget: number;
    targetCpa: number;
  } | null;
  audienceDefaults: {
    city?: string;
    cityKey?: string;
    ageMin?: number;
    ageMax?: number;
    gender?: string;
  } | null;
  ownerUserId: string | null;
  businessContext: string | null;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  isActive: boolean;
}

const VOICE_TONES = [
  {
    value: "professional",
    label: "Profissional",
    desc: "Formal, técnico, confiável",
  },
  { value: "casual", label: "Casual", desc: "Leve, próximo, descontraído" },
  { value: "urgent", label: "Urgente", desc: "Direto, impactante, gera ação" },
  {
    value: "premium",
    label: "Premium",
    desc: "Sofisticado, exclusivo, aspiracional",
  },
];

const OBJECTIVES = [
  { value: "aumentar_vendas", label: "Aumentar Vendas" },
  { value: "gerar_leads", label: "Atrair Clientes" },
  { value: "aumentar_trafego", label: "Aumentar Tráfego" },
  { value: "reconhecimento_marca", label: "Reconhecimento de Marca" },
];

const GENDERS = [
  { value: "all", label: "Todos" },
  { value: "male", label: "Homens" },
  { value: "female", label: "Mulheres" },
];

const AGE_OPTIONS = [18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65];

export function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");
  const [data, setData] = useState<TenantData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Users
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "member" as string,
  });

  // Subscription
  const [subForm, setSubForm] = useState({
    planId: "",
    status: "",
    trialEndsAt: "",
    currentPeriodEnd: "",
  });

  // FuryConfig
  const [configForm, setConfigForm] = useState({
    targetRoas: "",
    targetCpa: "",
    targetCtr: "",
    targetBudgetUtilization: "",
  });

  // Goals
  const [goalsForm, setGoalsForm] = useState({
    objective: "",
    niche: "",
    mainProduct: "",
    monthlyBudget: "",
    targetCpa: "",
  });

  // Audience
  const [audienceForm, setAudienceForm] = useState({
    city: "",
    cityKey: "",
    ageMin: 18,
    ageMax: 65,
    gender: "all",
  });
  const [cityQuery, setCityQuery] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const { locations, isLoading: loadingLocations } =
    useMetaLocations(cityQuery);
  const [businessContext, setBusinessContext] = useState("");

  // Brand Kit
  const [brandForm, setBrandForm] = useState({
    logoUrl: "",
    primaryColor: FURY_COLORS.primary,
    secondaryColor: "#1C1C1E",
    voiceTone: "",
  });
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.get(`/admin/tenants/${id}`), api.get("/admin/plans")])
      .then(([tRes, pRes]) => {
        const t = tRes.data.data as TenantData;
        setData(t);
        setPlans(pRes.data.data as Plan[]);

        setSubForm({
          planId: t.subscription?.planId ?? "",
          status: t.subscription?.status ?? "inactive",
          trialEndsAt: t.subscription?.trialEndsAt
            ? new Date(t.subscription.trialEndsAt).toISOString().slice(0, 16)
            : "",
          currentPeriodEnd: t.subscription?.currentPeriodEnd
            ? new Date(t.subscription.currentPeriodEnd)
                .toISOString()
                .slice(0, 16)
            : "",
        });
        setConfigForm({
          targetRoas: t.furyConfig?.targetRoas ?? "",
          targetCpa: t.furyConfig?.targetCpa ?? "",
          targetCtr: t.furyConfig?.targetCtr ?? "",
          targetBudgetUtilization: t.furyConfig?.targetBudgetUtilization ?? "",
        });
        setGoalsForm({
          objective: t.goals?.objective ?? "",
          niche: t.goals?.niche ?? "",
          mainProduct: t.goals?.mainProduct ?? "",
          monthlyBudget: t.goals?.monthlyBudget
            ? String(t.goals.monthlyBudget)
            : "",
          targetCpa: t.goals?.targetCpa ? String(t.goals.targetCpa) : "",
        });
        setAudienceForm({
          city: t.audienceDefaults?.city ?? "",
          cityKey: t.audienceDefaults?.cityKey ?? "",
          ageMin: t.audienceDefaults?.ageMin ?? 18,
          ageMax: t.audienceDefaults?.ageMax ?? 65,
          gender: t.audienceDefaults?.gender ?? "all",
        });
        setBrandForm({
          logoUrl: t.brandKit?.logoUrl ?? "",
          primaryColor: t.brandKit?.primaryColor ?? FURY_COLORS.primary,
          secondaryColor: t.brandKit?.secondaryColor ?? "#1C1C1E",
          voiceTone: t.brandKit?.voiceTone ?? "",
        });
        setPhotoUrls(t.brandKit?.photoUrls ?? []);
        if (t.businessContext) setBusinessContext(t.businessContext);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function reload() {
    const tRes = await api.get(`/admin/tenants/${id}`);
    setData(tRes.data.data);
  }

  function save(fn: () => Promise<void>, okMsg: string) {
    return async () => {
      setSaving(true);
      try {
        await fn();
        setMsg(okMsg);
        await reload();
      } catch {
        setMsg("Erro ao salvar");
      } finally {
        setSaving(false);
      }
    };
  }

  // ─── Save handlers ──────────────────────────────────
  const saveSub = save(async () => {
    const payload: Record<string, unknown> = {};
    if (subForm.planId) payload.planId = subForm.planId;
    if (subForm.status) payload.status = subForm.status;
    if (subForm.trialEndsAt)
      payload.trialEndsAt = new Date(subForm.trialEndsAt).toISOString();
    if (subForm.currentPeriodEnd)
      payload.currentPeriodEnd = new Date(
        subForm.currentPeriodEnd,
      ).toISOString();
    await api.patch(`/admin/tenants/${id}/subscription`, payload);
  }, "Assinatura atualizada");

  const saveConfig = save(async () => {
    await api.patch(`/admin/tenants/${id}/fury-config`, configForm);
  }, "Configurações atualizadas");

  const saveGoals = save(async () => {
    await api.put(`/admin/tenants/${id}/goals`, {
      ...goalsForm,
      monthlyBudget: Number(goalsForm.monthlyBudget),
      targetCpa: Number(goalsForm.targetCpa),
    });
  }, "Metas atualizadas");

  const saveAudience = save(async () => {
    await api.patch(`/admin/tenants/${id}/audience`, {
      ...audienceForm,
      businessContext,
    });
  }, "Público atualizado");

  const saveBrandKit = save(async () => {
    await api.patch(`/admin/tenants/${id}/brand-kit`, {
      primary_color: brandForm.primaryColor,
      secondary_color: brandForm.secondaryColor,
      voice_tone: brandForm.voiceTone || undefined,
      logo_url: brandForm.logoUrl || null,
      photo_urls: photoUrls,
    });
  }, "Brand Kit atualizado");

  // ─── Logo upload ─────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMsg("Logo muito grande. Máx 2MB.");
      return;
    }

    // Upload via the tenant's own brand-kit endpoint (uses storage service)
    // We'll use the existing client API endpoint — but that requires tenant context.
    // For admin, we upload to the existing endpoint by switching headers.
    // Simpliest: just set the URL directly if it's already hosted.
    // For now we use a FormData POST to /api/brand-kit/logo with tenant override
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/brand-kit/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBrandForm((prev) => ({ ...prev, logoUrl: res.data.data.url }));
      setMsg("Logo enviada!");
    } catch {
      // Fallback: just set as URL if user pastes
      setMsg("Erro ao enviar logo. Use uma URL.");
    }
  }

  // ─── Photos upload ───────────────────────────────────
  async function handlePhotosUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (photoUrls.length + files.length > 20) {
      setMsg("Máximo de 20 fotos.");
      return;
    }

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files[]", f));
      const res = await api.post("/brand-kit/photos", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPhotoUrls((prev) => [...prev, ...res.data.data.urls]);
      setMsg("Fotos enviadas!");
    } catch {
      setMsg("Erro ao enviar fotos.");
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  // ─── Create user ─────────────────────────────────────
  const createUser = async () => {
    setSaving(true);
    try {
      await api.post("/admin/users", { ...newUser, tenantId: id });
      setMsg("Usuário criado");
      setNewUser({ name: "", email: "", password: "", role: "member" });
      await reload();
    } catch {
      setMsg("Erro ao criar usuário");
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────
  if (loading)
    return (
      <div className="text-zinc-500 text-sm py-12 text-center">
        Carregando...
      </div>
    );
  if (!data)
    return (
      <div className="text-zinc-500 text-sm py-12 text-center">
        Tenant não encontrado
      </div>
    );

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Usuários" },
    { key: "subscription", label: "Assinatura" },
    { key: "config", label: "FURY Engine" },
    { key: "metas", label: "Metas" },
    { key: "publico", label: "Público" },
    { key: "brandkit", label: "Dados da Marca" },
  ];

  const inputCls =
    "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30";
  const labelCls = "block text-xs font-medium text-zinc-400 mb-1.5";
  const btnCls =
    "bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors";

  return (
    <div>
      <button
        onClick={() => navigate("/admin")}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{data.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {data.slug} · {data.users.length} usuários
          </p>
        </div>
      </div>

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

      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Users ───────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">
              Criar Usuário
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <input
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
                placeholder="Nome"
                className={inputCls}
              />
              <input
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
                placeholder="Email"
                type="email"
                className={inputCls}
              />
              <input
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
                placeholder="Senha"
                type="password"
                className={inputCls}
              />
              <div className="flex gap-2">
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value })
                  }
                  className={inputCls}
                >
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={createUser}
                  disabled={saving}
                  className={btnCls + " px-4"}
                >
                  <UserPlus className="w-4 h-4" /> Criar
                </button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                  <th className="text-left px-5 py-3 font-medium">Nome</th>
                  <th className="text-left px-5 py-3 font-medium">Email</th>
                  <th className="text-left px-5 py-3 font-medium">Role</th>
                  <th className="text-left px-5 py-3 font-medium">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-zinc-800/50 text-zinc-300"
                  >
                    <td className="px-5 py-3">{u.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Subscription ────────────────────────────── */}
      {tab === "subscription" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Plano</label>
              <select
                value={subForm.planId}
                onChange={(e) =>
                  setSubForm({ ...subForm, planId: e.target.value })
                }
                className={inputCls}
              >
                <option value="">Selecione um plano</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - R$ {(p.priceCents / 100).toFixed(2)}/{p.interval}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={subForm.status}
                onChange={(e) =>
                  setSubForm({ ...subForm, status: e.target.value })
                }
                className={inputCls}
              >
                <option value="trial">trial</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fim do Trial</label>
              <input
                type="datetime-local"
                value={subForm.trialEndsAt}
                onChange={(e) =>
                  setSubForm({ ...subForm, trialEndsAt: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Fim do Período Atual</label>
              <input
                type="datetime-local"
                value={subForm.currentPeriodEnd}
                onChange={(e) =>
                  setSubForm({ ...subForm, currentPeriodEnd: e.target.value })
                }
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveSub} disabled={saving} className={btnCls}>
              <Save className="w-4 h-4" /> Salvar
            </button>
            <button
              onClick={() => {
                const future = new Date();
                future.setDate(future.getDate() + 30);
                setSubForm((prev) => ({
                  ...prev,
                  status: "active",
                  currentPeriodEnd: future.toISOString().slice(0, 16),
                }));
              }}
              className="bg-green-700 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Ativar (30 dias)
            </button>
          </div>
        </div>
      )}

      {/* ── FURY Engine (Benchmarks) ─────────────────── */}
      {tab === "config" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">
              Benchmarks de Performance
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Defina as metas que o FURY usa para calcular o score de cada
              campanha.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Meta de ROAS (x)</label>
              <input
                type="number"
                step="0.1"
                value={configForm.targetRoas}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetRoas: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Meta de CPA (R$)</label>
              <input
                type="number"
                step="0.01"
                value={configForm.targetCpa}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetCpa: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Meta de CTR (%)</label>
              <input
                type="number"
                step="0.01"
                value={configForm.targetCtr}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetCtr: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Utilização de Budget (%)</label>
              <input
                type="number"
                value={configForm.targetBudgetUtilization}
                onChange={(e) =>
                  setConfigForm({
                    ...configForm,
                    targetBudgetUtilization: e.target.value,
                  })
                }
                className={inputCls}
              />
            </div>
          </div>
          <button onClick={saveConfig} disabled={saving} className={btnCls}>
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      )}

      {/* ── Metas ───────────────────────────────────── */}
      {tab === "metas" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">
              Metas do Cliente
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Objetivos e orçamento que a IA usa para otimizar campanhas.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Objetivo da campanha</label>
              <select
                value={goalsForm.objective}
                onChange={(e) =>
                  setGoalsForm({ ...goalsForm, objective: e.target.value })
                }
                className={inputCls}
              >
                <option value="">Selecione...</option>
                {OBJECTIVES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Nicho do negócio</label>
              <input
                value={goalsForm.niche}
                onChange={(e) =>
                  setGoalsForm({ ...goalsForm, niche: e.target.value })
                }
                placeholder="Ex: moda feminina"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Produto ou serviço principal</label>
              <input
                value={goalsForm.mainProduct}
                onChange={(e) =>
                  setGoalsForm({ ...goalsForm, mainProduct: e.target.value })
                }
                placeholder="Ex: vestidos casuais"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Orçamento mensal (R$)</label>
                <input
                  type="number"
                  min={300}
                  step={50}
                  value={goalsForm.monthlyBudget}
                  onChange={(e) =>
                    setGoalsForm({
                      ...goalsForm,
                      monthlyBudget: e.target.value,
                    })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>CPA alvo (R$)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={goalsForm.targetCpa}
                  onChange={(e) =>
                    setGoalsForm({ ...goalsForm, targetCpa: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
            </div>
          </div>
          <button onClick={saveGoals} disabled={saving} className={btnCls}>
            <Save className="w-4 h-4" /> Salvar Metas
          </button>
        </div>
      )}

      {/* ── Público ──────────────────────────────────── */}
      {tab === "publico" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">
              Público Padrão
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Dados usados como padrão ao criar novas campanhas.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Descrição do Público</label>
              <textarea
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Descreva o nicho, os clientes e o contexto do negócio. Esse texto é usado pela IA do FURY ao gerar criativos."
                rows={4}
                className={`${inputCls} resize-y min-h-[100px]`}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Ex: nicho, porte, região, ticket médio, diferencial competitivo,
                público-alvo.
              </p>
            </div>
            <div className="relative">
              <label className={labelCls}>Cidade</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => {
                    setCityQuery(e.target.value);
                    setAudienceForm({
                      ...audienceForm,
                      city: e.target.value,
                      cityKey: "",
                    });
                    setShowCityDropdown(true);
                  }}
                  onFocus={() => setShowCityDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCityDropdown(false), 150)
                  }
                  placeholder="Digite o nome da cidade"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                {loadingLocations && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
                )}
              </div>
              {showCityDropdown && locations.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {locations.map((location) => (
                    <button
                      key={location.key}
                      type="button"
                      onMouseDown={() => {
                        const label = location.region
                          ? `${location.name}, ${location.region}`
                          : location.name;
                        setCityQuery(label);
                        setAudienceForm({
                          ...audienceForm,
                          city: label,
                          cityKey: location.key,
                        });
                        setShowCityDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-zinc-700 text-sm text-zinc-200"
                    >
                      {location.region
                        ? `${location.name}, ${location.region}`
                        : location.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Faixa etária</label>
              <div className="flex items-center gap-3">
                <select
                  value={audienceForm.ageMin}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setAudienceForm((prev) => ({
                      ...prev,
                      ageMin: v,
                      ageMax: Math.max(v, prev.ageMax),
                    }));
                  }}
                  className={inputCls}
                >
                  {AGE_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <span className="text-zinc-500 text-sm">até</span>
                <select
                  value={audienceForm.ageMax}
                  onChange={(e) =>
                    setAudienceForm({
                      ...audienceForm,
                      ageMax: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                >
                  {AGE_OPTIONS.filter((a) => a >= audienceForm.ageMin).map(
                    (a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Gênero</label>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() =>
                      setAudienceForm({ ...audienceForm, gender: g.value })
                    }
                    className={`py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${audienceForm.gender === g.value ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={saveAudience} disabled={saving} className={btnCls}>
            <Save className="w-4 h-4" /> Salvar Público
          </button>
        </div>
      )}

      {/* ── Brand Kit ────────────────────────────────── */}
      {tab === "brandkit" && (
        <div className="space-y-6">
          {/* Logo */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">
              Logo da Marca
            </h3>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={handleLogoUpload}
            />
            {brandForm.logoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={brandForm.logoUrl}
                  alt="Logo"
                  className="w-20 h-20 object-contain rounded-lg border border-zinc-700 bg-zinc-800 p-2"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={saving}
                    className="text-sm text-amber-400 hover:text-amber-300"
                  >
                    Substituir
                  </button>
                  <button
                    onClick={() =>
                      setBrandForm((prev) => ({ ...prev, logoUrl: "" }))
                    }
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => logoInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-xl py-10 cursor-pointer hover:border-amber-500/50 transition-colors"
              >
                <Upload className="w-6 h-6 text-zinc-500" />
                <p className="text-sm text-zinc-500">
                  Arraste sua logo ou clique (PNG/SVG, máx 2MB)
                </p>
              </div>
            )}
          </div>

          {/* Cores */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">
              Paleta de Cores
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelCls}>Cor Principal</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandForm.primaryColor}
                    onChange={(e) =>
                      setBrandForm({
                        ...brandForm,
                        primaryColor: e.target.value,
                      })
                    }
                    className="w-12 h-12 rounded-lg border border-zinc-700 cursor-pointer p-1 bg-zinc-800"
                  />
                  <span className="text-sm font-mono text-zinc-400 uppercase">
                    {brandForm.primaryColor}
                  </span>
                </div>
              </div>
              <div>
                <label className={labelCls}>Cor Secundária</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandForm.secondaryColor}
                    onChange={(e) =>
                      setBrandForm({
                        ...brandForm,
                        secondaryColor: e.target.value,
                      })
                    }
                    className="w-12 h-12 rounded-lg border border-zinc-700 cursor-pointer p-1 bg-zinc-800"
                  />
                  <span className="text-sm font-mono text-zinc-400 uppercase">
                    {brandForm.secondaryColor}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tom de Voz */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">
              Tom de Voz
            </h3>
            <select
              value={brandForm.voiceTone}
              onChange={(e) =>
                setBrandForm({ ...brandForm, voiceTone: e.target.value })
              }
              className={inputCls}
            >
              <option value="">Selecione um tom de voz</option>
              {VOICE_TONES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Fotos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-100">
                Biblioteca de Fotos
              </h3>
              <span className="text-xs text-zinc-500">
                {photoUrls.length}/20 fotos
              </span>
            </div>
            <input
              ref={photosInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={handlePhotosUpload}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {photoUrls.map((url) => (
                <div
                  key={url}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-700"
                >
                  <img
                    src={url}
                    alt="Foto"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(url)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {photoUrls.length < 20 && (
                <div
                  onClick={() => photosInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-amber-500/50 transition-colors"
                >
                  <ImageIcon className="w-5 h-5 text-zinc-500" />
                  <p className="text-xs text-zinc-500">Adicionar fotos</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={saveBrandKit}
            disabled={saving}
            className={btnCls + " w-full justify-center"}
          >
            <Save className="w-4 h-4" /> Salvar Dados da Marca
          </button>
        </div>
      )}
    </div>
  );
}
