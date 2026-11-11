import { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Save,
  UserPlus,
  Upload,
  X,
  Image as ImageIcon,
  Trash2,
  Users,
  CreditCard,
  Target,
  UserRoundSearch,
  Palette,
  Package,
  BadgeCheck,
  Hourglass,
  CalendarClock,
  TrendingUp,
  Receipt,
  MousePointerClick,
  Wallet,
  Flag,
  Tag,
  ShoppingBag,
  FileText,
  Cake,
  VenusAndMars,
  MessageCircle,
  Images,
  Zap,
  RotateCw,
  Info,
} from "lucide-react";
import api from "@/lib/api";
import { getStoredPlatformRole } from "@/lib/platform-role";
import type { AudienceGeo } from "@/components/campaign-wizard/types";
import { isValidGeo, legacyFromGeo, EMPTY_GEO } from "@/components/campaign-wizard/types";
import { LocationEditor } from "@/pages/configuracoes/LocationEditor";
import { FURY_COLORS } from "@/lib/constants";
import { SectionNav, buildSectionSummaries, type SectionItem } from "./tenant-detail/SectionNav";
import { FormSection, FieldLabel } from "./tenant-detail/FormSection";
import { UserCard } from "./tenant-detail/UserCard";
import { UserPager } from "./tenant-detail/UserPager";
import { CreateUserModal } from "./tenant-detail/CreateUserModal";
import { ResetPasswordModal } from "./tenant-detail/ResetPasswordModal";

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
    platformRole?: string | null;
    createdAt: string;
  }[];
  subscription: {
    id: string;
    planId: string;
    status: string;
    isNonExpirable: boolean;
    trialEndsAt: string;
    currentPeriodEnd: string;
    asaasSubscriptionId: string;
    creativesRemaining: number | null;
    plan: {
      id: string;
      name: string;
      priceCents: number;
      interval: string;
      limits?: {
        creativesPerMonth?: number | null;
      } | null;
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
    audienceInterests?: { id: string; name: string }[];
    geo?: unknown;
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

const MAX_PARTNER_CLIENT_MEMBERS = 2;
const TITULAR_REMOVAL_WAIT_SECONDS = 5;
const USERS_PER_PAGE = 9;

const SECTIONS: { key: Tab; label: string; icon: SectionItem<Tab>["icon"] }[] = [
  { key: "users", label: "Usuários", icon: Users },
  { key: "subscription", label: "Assinatura", icon: CreditCard },
  { key: "config", label: "Metas", icon: Target },
  { key: "metas", label: "Objetivo", icon: Flag },
  { key: "publico", label: "Público", icon: UserRoundSearch },
  { key: "brandkit", label: "Dados da Marca", icon: Palette },
];

export function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("users");
  const [data, setData] = useState<TenantData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renewingQuota, setRenewingQuota] = useState(false);
  // assinatura e planos: só super_admin (a API também recusa)
  const isSuperAdmin = getStoredPlatformRole() === "super_admin";
  const [msg, setMsg] = useState("");

  // Users
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "member" as string,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [createError, setCreateError] = useState("");
  const [userPage, setUserPage] = useState(1);

  // Edit user
  const [editUser, setEditUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: string;
  } | null>(null);

  // Delete user
  const [deleteUserTarget, setDeleteUserTarget] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  // parceiro removendo o titular: some o cliente inteiro
  const removesWholeClient = !isSuperAdmin && deleteUserTarget?.role === "owner";
  const [confirmSeconds, setConfirmSeconds] = useState(0);
  const [deleteUserError, setDeleteUserError] = useState("");

  // layout effect: o botão já nasce travado
  useLayoutEffect(() => {
    if (!removesWholeClient) return;
    setConfirmSeconds(TITULAR_REMOVAL_WAIT_SECONDS);
    const timer = setInterval(() => setConfirmSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [removesWholeClient, deleteUserTarget?.id]);

  useEffect(() => setDeleteUserError(""), [deleteUserTarget?.id]);

  // Subscription
  const [subForm, setSubForm] = useState({
    planId: "",
    status: "",
    isNonExpirable: false,
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
    // Mantidos ao salvar (o PATCH substitui a audiência inteira)
    audienceInterests: [] as { id: string; name: string }[],
  });
  const [geo, setGeo] = useState<AudienceGeo>(EMPTY_GEO);
  const [geoTouched, setGeoTouched] = useState(false);
  const [hasSavedGeo, setHasSavedGeo] = useState(false);
  // Remonta o editor quando o salvo termina de carregar
  const [geoLoadKey, setGeoLoadKey] = useState(0);
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
    Promise.all([
      api.get(`/admin/tenants/${id}`),
      // só os planos do dono do cliente (ady ou o parceiro)
      api.get(`/admin/tenants/${id}/assignable-plans`),
    ])
      .then(([tRes, pRes]) => {
        const t = tRes.data.data as TenantData;
        setData(t);
        setPlans(pRes.data.data as Plan[]);

        setSubForm({
          planId: t.subscription?.planId ?? "",
          status: t.subscription?.status ?? "inactive",
          isNonExpirable: t.subscription?.isNonExpirable ?? false,
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
          audienceInterests: t.audienceDefaults?.audienceInterests ?? [],
        });
        const savedGeo = t.audienceDefaults?.geo;
        if (isValidGeo(savedGeo)) {
          setHasSavedGeo(true);
          setGeo({ ...savedGeo, regionType: savedGeo.regions.length ? savedGeo.regionType : undefined });
        } else if (t.audienceDefaults?.city && t.audienceDefaults?.cityKey) {
          setGeo({ ...EMPTY_GEO, regionType: "city", regions: [{ key: t.audienceDefaults.cityKey, name: t.audienceDefaults.city }] });
        }
        setGeoLoadKey((k) => k + 1);
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
    return tRes.data.data as TenantData;
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
    payload.isNonExpirable = subForm.isNonExpirable;
    if (subForm.trialEndsAt)
      payload.trialEndsAt = new Date(subForm.trialEndsAt).toISOString();
    if (subForm.currentPeriodEnd)
      payload.currentPeriodEnd = new Date(
        subForm.currentPeriodEnd,
      ).toISOString();
    await api.patch(`/admin/tenants/${id}/subscription`, payload);
  }, "Assinatura atualizada");

  async function renewCreativeQuota() {
    setRenewingQuota(true);
    setMsg("");
    try {
      await api.post(`/admin/tenants/${id}/reset-quota`);
      setMsg("Cota de créditos renovada");
      await reload();
    } catch {
      setMsg("Não foi possível renovar a cota. Tente novamente.");
    } finally {
      setRenewingQuota(false);
    }
  }

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

  const saveGeo = hasSavedGeo || geoTouched;
  const saveAudience = save(async () => {
    // Campos antigos seguem preenchidos (wizard, revisão e planner leem city)
    const legacy = saveGeo ? legacyFromGeo(geo) : { city: audienceForm.city, cityKey: audienceForm.cityKey };
    await api.patch(`/admin/tenants/${id}/audience`, {
      ...audienceForm,
      ...legacy,
      ...(saveGeo ? { geo } : {}),
      businessContext,
    });
    setAudienceForm((prev) => ({ ...prev, ...legacy }));
    if (saveGeo) setHasSavedGeo(true);
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

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/brand-kit/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBrandForm((prev) => ({ ...prev, logoUrl: res.data.data.url }));
      setMsg("Logo enviada!");
    } catch {
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
    setCreateError("");
    try {
      await api.post("/admin/users", { ...newUser, tenantId: id });
      setMsg("Usuário criado");
      setNewUser({ name: "", email: "", password: "", role: "member" });
      setCreateOpen(false);
      const fresh = await reload();
      // mostra o usuário novo
      setUserPage(Math.max(1, Math.ceil(fresh.users.length / USERS_PER_PAGE)));
    } catch {
      setCreateError("Erro ao criar usuário");
    } finally {
      setSaving(false);
    }
  };

  // ─── Reset password (suporte) ────────────────────────
  const resetPassword = async (password: string) => {
    if (!resetTarget) return;
    setResetting(true);
    setResetError("");
    try {
      await api.post(`/admin/users/${resetTarget.id}/password`, { password });
      setMsg(`Senha de ${resetTarget.name} alterada`);
      setResetTarget(null);
    } catch {
      setResetError("Não foi possível trocar a senha. Tente novamente.");
    } finally {
      setResetting(false);
    }
  };

  const closeReset = useCallback(() => setResetTarget(null), []);

  // fechar descarta a senha digitada
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError("");
    setNewUser((prev) => ({ ...prev, password: "" }));
  }, []);

  // ─── Edit user ───────────────────────────────────────
  const handleEditUser = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.patch(`/admin/users/${editUser.id}`, {
        name: editUser.name,
        role: editUser.role,
      });
      setMsg("Usuário atualizado");
      setEditUser(null);
      await reload();
    } catch {
      setMsg("Erro ao atualizar usuário");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete user ─────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!deleteUserTarget || (removesWholeClient && confirmSeconds > 0)) return;
    setDeletingUser(true);
    try {
      await api.delete(`/admin/users/${deleteUserTarget.id}`);
      if (removesWholeClient) {
        navigate("/admin/clientes");
        return;
      }
      setMsg("Usuário removido");
      setDeleteUserTarget(null);
      await reload();
    } catch {
      setDeleteUserError("Não foi possível remover. Tente novamente.");
      // nova tentativa do titular volta a esperar
      if (removesWholeClient) setConfirmSeconds(TITULAR_REMOVAL_WAIT_SECONDS);
    } finally {
      setDeletingUser(false);
    }
  };

  // ─── Render ──────────────────────────────────────────
  if (loading)
    return (
      <div className="text-admin-text-faint text-sm py-12 text-center">
        Carregando...
      </div>
    );
  if (!data)
    return (
      <div className="text-admin-text-faint text-sm py-12 text-center">
        Cliente não encontrado
      </div>
    );

  const summaries = buildSectionSummaries(data, {
    isSuperAdmin,
    maxMembers: MAX_PARTNER_CLIENT_MEMBERS,
    labels: { objectives: OBJECTIVES, genders: GENDERS, tones: VOICE_TONES },
  });
  const sectionItems: SectionItem<Tab>[] = SECTIONS.map((s) => ({ ...s, ...summaries[s.key] }));

  const memberLimitReached = !isSuperAdmin && data.users.filter((u) => u.role === "member").length >= MAX_PARTNER_CLIENT_MEMBERS;
  // página válida mesmo após remover
  const userPages = Math.max(1, Math.ceil(data.users.length / USERS_PER_PAGE));
  const currentUserPage = Math.min(userPage, userPages);
  const pageUsers = data.users.slice((currentUserPage - 1) * USERS_PER_PAGE, currentUserPage * USERS_PER_PAGE);

  const inputCls =
    "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol";
  const labelCls = "block text-xs font-medium text-admin-text-muted mb-1.5";
  const metricCls = "bg-admin-surface-2 rounded-xl p-4";
  const hintCls = "text-xs text-admin-text-muted mb-2 leading-snug";
  const btnCls =
    "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-6 py-2.5 flex items-center gap-2";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-admin-text">{data.name}</h1>
          <p className="text-sm text-admin-text-faint mt-1">
            {data.users.length} usuários
          </p>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 bg-admin-surface border border-admin-border rounded-xl text-sm text-admin-text flex items-center justify-between">
          {msg}
          <button
            onClick={() => setMsg("")}
            className="ady-btn text-admin-text-faint hover:text-admin-text"
          >
            ✕
          </button>
        </div>
      )}

      <SectionNav<Tab> items={sectionItems} active={tab} onSelect={setTab} />

      {/* ── Users ───────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-4">
          {data.users.length === 0 && (
            <div role="status" className="bg-admin-petrol/10 border border-admin-petrol/30 rounded-2xl px-5 py-4 text-sm text-admin-text-muted">
              Esta conta não possui usuários ativos. Para recuperar o acesso, crie um novo usuário com cargo Usuário Titular.
            </div>
          )}
          <div className="bg-admin-surface border border-admin-border rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h3 className="text-sm font-semibold text-admin-text">Usuários do cliente</h3>
              <div className="text-xs text-admin-text-muted">{data.users.length} cadastrados</div>
            </div>
            {memberLimitReached && (
              <div role="status" className="flex items-center gap-1.5 text-xs text-admin-text-muted bg-admin-petrol/10 rounded-full px-3 py-1.5">
                <Info aria-hidden="true" className="w-3.5 h-3.5 text-[#17708A] dark:text-[#1E88A8]" />
                Limite de {MAX_PARTNER_CLIENT_MEMBERS} usuários por cliente atingido.
              </div>
            )}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={memberLimitReached}
              className={btnCls + " justify-center max-sm:w-full disabled:cursor-not-allowed"}
            >
              <UserPlus className="w-4 h-4" /> Criar Usuário
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageUsers.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                onEdit={() => setEditUser({ id: u.id, name: u.name ?? "", email: u.email, role: u.role })}
                onResetPassword={() => { setResetError(""); setResetTarget({ id: u.id, name: u.name || u.email }); }}
                onRemove={() => setDeleteUserTarget({ id: u.id, name: u.name ?? "sem nome", role: u.role })}
              />
            ))}
          </div>

          <UserPager total={data.users.length} page={currentUserPage} perPage={USERS_PER_PAGE} onChange={setUserPage} />
        </div>
      )}

      {resetTarget && (
        <ResetPasswordModal
          key={resetTarget.id}
          userName={resetTarget.name}
          saving={resetting}
          error={resetError}
          onSubmit={resetPassword}
          onClose={closeReset}
        />
      )}

      <CreateUserModal
        open={createOpen}
        value={newUser}
        onChange={setNewUser}
        onSubmit={createUser}
        onClose={closeCreate}
        saving={saving}
        error={createError}
        isSuperAdmin={isSuperAdmin}
      />

      {/* ── Edit User Modal ────────────────────────────── */}
      {editUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditUser(null)}
        >
          <div
            className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-admin-text">
                Editar Usuário
              </h2>
              <button
                onClick={() => setEditUser(null)}
                className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Nome</label>
                <input
                  value={editUser.name}
                  onChange={(e) =>
                    setEditUser({ ...editUser, name: e.target.value })
                  }
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  value={editUser.email}
                  readOnly
                  disabled
                  type="email"
                  className={`${inputCls} opacity-60`}
                />
              </div>
              {isSuperAdmin && (
                <div>
                  <label className={labelCls}>Cargo</label>
                  <select
                    value={editUser.role}
                    onChange={(e) =>
                      setEditUser({ ...editUser, role: e.target.value })
                    }
                    className={inputCls}
                  >
                    <option value="member">Usuário</option>
                    <option value="admin">Administrador</option>
                    <option value="owner">Usuário Titular</option>
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditUser(null)}
                  className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEditUser}
                  disabled={saving}
                  className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors flex-1 py-2.5 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete User Confirmation ───────────────────── */}
      {deleteUserTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDeleteUserTarget(null)}
        >
          <div
            className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-admin-text">
                {removesWholeClient ? "Remover usuário titular e cliente" : "Remover Usuário"}
              </h2>
              <button
                onClick={() => setDeleteUserTarget(null)}
                className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-admin-text-muted mb-2">
              Tem certeza que deseja remover{" "}
              <strong className="text-admin-text">
                {deleteUserTarget.name}
              </strong>
              ?
            </p>
            {removesWholeClient ? (
              <div role="alert" className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2.5 mb-6">
                O usuário titular e <strong className="text-error">todos os usuários vinculados</strong> deste cliente serão removidos e perderão o acesso. A vaga será liberada e você não poderá reaver este cliente.
              </div>
            ) : (
              <p className="text-xs text-admin-text-faint mb-6">
                O usuário perderá acesso ao sistema.
              </p>
            )}
            {deleteUserError && (
              <div className="text-sm text-error mb-4">{deleteUserError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteUserTarget(null)}
                className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deletingUser || (removesWholeClient && confirmSeconds > 0)}
                className="ady-btn flex-1 bg-[#E5534B] hover:bg-[#E5534B]/90 disabled:opacity-50 text-white py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {deletingUser ? (
                  "Removendo..."
                ) : removesWholeClient && confirmSeconds > 0 ? (
                  `Aguarde ${confirmSeconds}s`
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> {removesWholeClient ? "Sim, remover tudo" : "Sim, remover"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription ────────────────────────────── */}
      {tab === "subscription" && (
        <div className="space-y-4">
          {(() => {
            const subscription = data?.subscription;
            const creativesLimit = subscription?.plan?.limits?.creativesPerMonth ?? null;
            const hasLimitedQuota = subscription !== null && subscription !== undefined && creativesLimit !== null;

            const remaining = subscription?.creativesRemaining ?? 0;
            const pct = hasLimitedQuota && creativesLimit ? Math.min(100, Math.max(0, (remaining / creativesLimit) * 100)) : 0;

            return (
              <FormSection
                icon={ImageIcon}
                title="Créditos de imagem"
                titleId="image-credits-title"
                right={hasLimitedQuota ? (
                  <button
                    onClick={renewCreativeQuota}
                    disabled={renewingQuota}
                    className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors shrink-0 px-4 py-2.5 flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" /> {renewingQuota ? "Renovando..." : "Renovar cota"}
                  </button>
                ) : undefined}
              >
                {!subscription ? (
                  <p className="text-sm text-admin-text-faint">Configure uma assinatura para liberar créditos.</p>
                ) : hasLimitedQuota ? (
                  <div className="space-y-2">
                    <div className="text-xl font-bold text-admin-text tabular-nums">{remaining} de {creativesLimit} disponíveis</div>
                    <div
                      role="progressbar"
                      aria-label="Créditos disponíveis"
                      aria-valuenow={remaining}
                      aria-valuemin={0}
                      aria-valuemax={creativesLimit ?? 0}
                      className="h-2 rounded-full bg-admin-surface-2 overflow-hidden"
                    >
                      <div className="h-full rounded-full bg-admin-petrol" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-admin-text-faint">A renovação restaura o saldo ao limite mensal do plano.</div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-admin-text">Créditos ilimitados</div>
                )}
              </FormSection>
            );
          })()}

        <FormSection icon={CreditCard} title="Assinatura">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel icon={Package} htmlFor="sub-plan">Plano</FieldLabel>
              <select
                id="sub-plan"
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
              <FieldLabel icon={BadgeCheck} htmlFor="sub-status">Status</FieldLabel>
              <select
                id="sub-status"
                value={subForm.status}
                onChange={(e) =>
                  setSubForm({ ...subForm, status: e.target.value })
                }
                className={inputCls}
              >
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div>
              <FieldLabel icon={Hourglass} htmlFor="sub-trial">Fim do Trial</FieldLabel>
              <input
                id="sub-trial"
                type="datetime-local"
                value={subForm.trialEndsAt}
                onChange={(e) =>
                  setSubForm({ ...subForm, trialEndsAt: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel icon={CalendarClock} htmlFor="sub-period-end">Fim do Período Atual</FieldLabel>
              <input
                id="sub-period-end"
                type="datetime-local"
                value={subForm.currentPeriodEnd}
                onChange={(e) =>
                  setSubForm({ ...subForm, currentPeriodEnd: e.target.value })
                }
                className={inputCls}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-admin-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={subForm.isNonExpirable}
              onChange={(e) =>
                setSubForm({ ...subForm, isNonExpirable: e.target.checked })
              }
              className="w-4 h-4 rounded border-admin-border bg-admin-bg text-admin-petrol focus:ring-admin-petrol/30"
            />
            Plano não expirável (ignora vencimento)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={saveSub} disabled={saving} className={btnCls}>
              <Save className="w-4 h-4" /> Salvar
            </button>
            <button
              onClick={() => {
                const future = new Date();
                future.setDate(future.getDate() + 30);
                const cheapestPlanId = [...plans]
                  .filter((p) => p.isActive)
                  .sort((a, b) => a.priceCents - b.priceCents)[0]?.id;
                setSubForm((prev) => ({
                  ...prev,
                  status: "active",
                  currentPeriodEnd: future.toISOString().slice(0, 16),
                  planId: prev.planId || cheapestPlanId || prev.planId,
                }));
              }}
              className="ady-btn bg-success hover:bg-success/90 text-white px-4 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <Zap className="w-4 h-4" /> Ativar (30 dias)
            </button>
          </div>
        </FormSection>
        </div>
      )}

      {/* ── Metas (benchmarks do score) ─────────────── */}
      {tab === "config" && (
        <FormSection
          icon={Target}
          title="Metas de performance"
          description="Os números que o ady usa como referência para dar nota a cada campanha do cliente."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className={metricCls}>
              <FieldLabel icon={TrendingUp} htmlFor="cfg-roas">Meta de ROAS (x)</FieldLabel>
              <div id="cfg-roas-hint" className={hintCls}>Quanto a campanha deve vender para cada R$ 1 investido. Ex.: 4 = R$ 4 em vendas por R$ 1.</div>
              <input
                id="cfg-roas"
                aria-describedby="cfg-roas-hint"
                type="number"
                step="0.1"
                value={configForm.targetRoas}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetRoas: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className={metricCls}>
              <FieldLabel icon={Receipt} htmlFor="cfg-cpa">Meta de CPA (R$)</FieldLabel>
              <div id="cfg-cpa-hint" className={hintCls}>Quanto vale pagar, no máximo, por cada venda ou contato conquistado.</div>
              <input
                id="cfg-cpa"
                aria-describedby="cfg-cpa-hint"
                type="number"
                step="0.01"
                value={configForm.targetCpa}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetCpa: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className={metricCls}>
              <FieldLabel icon={MousePointerClick} htmlFor="cfg-ctr">Meta de CTR (%)</FieldLabel>
              <div id="cfg-ctr-hint" className={hintCls}>De cada 100 pessoas que veem o anúncio, quantas devem clicar.</div>
              <input
                id="cfg-ctr"
                aria-describedby="cfg-ctr-hint"
                type="number"
                step="0.01"
                value={configForm.targetCtr}
                onChange={(e) =>
                  setConfigForm({ ...configForm, targetCtr: e.target.value })
                }
                className={inputCls}
              />
            </div>
            <div className={metricCls}>
              <FieldLabel icon={Wallet} htmlFor="cfg-budget">Utilização de Budget (%)</FieldLabel>
              <div id="cfg-budget-hint" className={hintCls}>Quanto do orçamento da campanha deve ser gasto no período. Ex.: 80 = gastar 80% do previsto.</div>
              <input
                id="cfg-budget"
                aria-describedby="cfg-budget-hint"
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
        </FormSection>
      )}

      {/* ── Metas ───────────────────────────────────── */}
      {tab === "metas" && (
        <FormSection
          icon={Flag}
          title="Objetivo do Cliente"
          description="Objetivos e orçamento que a IA usa para otimizar campanhas."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <FieldLabel icon={Flag} htmlFor="goals-objective">Objetivo da campanha</FieldLabel>
              <select
                id="goals-objective"
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
              <FieldLabel icon={Tag} htmlFor="goals-niche">Nicho do negócio</FieldLabel>
              <input
                id="goals-niche"
                value={goalsForm.niche}
                onChange={(e) =>
                  setGoalsForm({ ...goalsForm, niche: e.target.value })
                }
                placeholder="Ex: moda feminina"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel icon={ShoppingBag} htmlFor="goals-product">Produto ou serviço principal</FieldLabel>
              <input
                id="goals-product"
                value={goalsForm.mainProduct}
                onChange={(e) =>
                  setGoalsForm({ ...goalsForm, mainProduct: e.target.value })
                }
                placeholder="Ex: vestidos casuais"
                className={inputCls}
              />
            </div>
              <div>
                <FieldLabel icon={Wallet} htmlFor="goals-budget">Orçamento mensal (R$)</FieldLabel>
                <input
                  id="goals-budget"
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
                <FieldLabel icon={Receipt} htmlFor="goals-cpa">CPA alvo (R$)</FieldLabel>
                <input
                  id="goals-cpa"
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
          <button onClick={saveGoals} disabled={saving} className={btnCls}>
            <Save className="w-4 h-4" /> Salvar Metas
          </button>
        </FormSection>
      )}

      {/* ── Público ──────────────────────────────────── */}
      {tab === "publico" && (
        <FormSection
          icon={UserRoundSearch}
          title="Público Padrão"
          description="Dados usados como padrão ao criar novas campanhas."
        >
          <div className="space-y-4">
            <div>
              <FieldLabel icon={FileText} htmlFor="audience-context">Descrição do Público</FieldLabel>
              <textarea
                id="audience-context"
                value={businessContext}
                onChange={(e) => setBusinessContext(e.target.value)}
                placeholder="Descreva o nicho, os clientes e o contexto do negócio. Esse texto é usado pela IA do ady ao gerar criativos."
                rows={4}
                className={`${inputCls} resize-y min-h-[100px]`}
              />
              <p className="text-xs text-admin-text-faint mt-1">
                Ex: nicho, porte, região, ticket médio, diferencial competitivo,
                público-alvo.
              </p>
            </div>
            <LocationEditor
              key={geoLoadKey}
              value={geo}
              onChange={(update) => { setGeo(update); setGeoTouched(true); }}
              legacyCity={!saveGeo && audienceForm.cityKey ? audienceForm.city : undefined}
              admin
              tenantId={id}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel icon={Cake} htmlFor="audience-age-min">Faixa etária</FieldLabel>
              <div className="flex items-center gap-3">
                <select
                  id="audience-age-min"
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
                <span className="text-admin-text-faint text-sm">até</span>
                <select
                  aria-label="Idade máxima"
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
              <FieldLabel icon={VenusAndMars}>Gênero</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() =>
                      setAudienceForm({ ...audienceForm, gender: g.value })
                    }
                    className={`ady-btn py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                      audienceForm.gender === g.value
                        ? "border-admin-petrol bg-admin-petrol/10 text-[#17708A] dark:text-[#1E88A8]"
                        : "border-admin-border text-admin-text-muted hover:border-admin-text-faint"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>
          <button onClick={saveAudience} disabled={saving} className={btnCls}>
            <Save className="w-4 h-4" /> Salvar Público
          </button>
        </FormSection>
      )}

      {/* ── Brand Kit ────────────────────────────────── */}
      {tab === "brandkit" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormSection icon={ImageIcon} title="Logo da Marca">
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
                  className="w-20 h-20 object-contain rounded-lg border border-admin-border bg-admin-bg p-2"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={saving}
                    className="ady-btn text-sm text-[#17708A] dark:text-[#1E88A8] hover:underline"
                  >
                    Substituir
                  </button>
                  <button
                    onClick={() =>
                      setBrandForm((prev) => ({ ...prev, logoUrl: "" }))
                    }
                    className="ady-btn text-sm text-admin-danger hover:text-admin-danger/80"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => logoInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-admin-border rounded-xl py-10 cursor-pointer hover:border-admin-petrol/50 transition-colors"
              >
                <Upload className="w-6 h-6 text-admin-text-faint" />
                <p className="text-sm text-admin-text-faint">
                  Arraste sua logo ou clique (PNG/SVG, máx 2MB)
                </p>
              </div>
            )}
          </FormSection>

          <FormSection icon={Palette} title="Paleta de Cores">
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
                    className="w-12 h-12 rounded-lg border border-admin-border cursor-pointer p-1 bg-admin-bg"
                  />
                  <span className="text-sm font-mono text-admin-text-muted uppercase">
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
                    className="w-12 h-12 rounded-lg border border-admin-border cursor-pointer p-1 bg-admin-bg"
                  />
                  <span className="text-sm font-mono text-admin-text-muted uppercase">
                    {brandForm.secondaryColor}
                  </span>
                </div>
              </div>
            </div>
          </FormSection>
          </div>

          <FormSection icon={MessageCircle} title="Tom de Voz">
            <select
              aria-label="Tom de Voz"
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
          </FormSection>

          <FormSection
            icon={Images}
            title="Biblioteca de Fotos"
            right={<span className="text-xs text-admin-text-faint shrink-0">{photoUrls.length}/20 fotos</span>}
          >
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
                  className="relative group aspect-square rounded-lg overflow-hidden border border-admin-border"
                >
                  <img
                    src={url}
                    alt="Foto"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(url)}
                    className="ady-btn absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full text-white hover:opacity-80 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {photoUrls.length < 20 && (
                <div
                  onClick={() => photosInputRef.current?.click()}
                  className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-admin-border rounded-lg cursor-pointer hover:border-admin-petrol/50 transition-colors"
                >
                  <ImageIcon className="w-5 h-5 text-admin-text-faint" />
                  <p className="text-xs text-admin-text-faint">Adicionar fotos</p>
                </div>
              )}
            </div>
          </FormSection>

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
