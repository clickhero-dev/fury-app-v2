import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import api from '@/lib/api';

type Tab = 'users' | 'subscription' | 'config';

interface TenantData {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: { id: string; name: string; email: string; role: string; createdAt: string }[];
  subscription: {
    id: string;
    planId: string;
    status: string;
    trialEndsAt: string;
    currentPeriodEnd: string;
    asaasSubscriptionId: string;
    plan: { id: string; name: string; priceCents: number; interval: string } | null;
  } | null;
  furyConfig: {
    id: string;
    targetRoas: string;
    targetCpa: string;
    targetCtr: string;
    targetBudgetUtilization: string;
  } | null;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  isActive: boolean;
}

export function TenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('users');
  const [data, setData] = useState<TenantData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Form state
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' as string });
  const [subForm, setSubForm] = useState({ planId: '', status: '', billingType: '', trialEndsAt: '', currentPeriodEnd: '' });
  const [configForm, setConfigForm] = useState({ targetRoas: '', targetCpa: '', targetCtr: '', targetBudgetUtilization: '' });

  useEffect(() => {
    Promise.all([
      api.get(`/admin/tenants/${id}`),
      api.get('/admin/plans'),
    ]).then(([tRes, pRes]) => {
      const tenant = tRes.data.data as TenantData;
      setData(tenant);
      setPlans(pRes.data.data as Plan[]);

      setSubForm({
        planId: tenant.subscription?.planId ?? '',
        status: tenant.subscription?.status ?? 'inactive',
        billingType: tenant.subscription?.asaasSubscriptionId ?? '',
        trialEndsAt: tenant.subscription?.trialEndsAt ? new Date(tenant.subscription.trialEndsAt).toISOString().slice(0, 16) : '',
        currentPeriodEnd: tenant.subscription?.currentPeriodEnd ? new Date(tenant.subscription.currentPeriodEnd).toISOString().slice(0, 16) : '',
      });
      setConfigForm({
        targetRoas: tenant.furyConfig?.targetRoas ?? '',
        targetCpa: tenant.furyConfig?.targetCpa ?? '',
        targetCtr: tenant.furyConfig?.targetCtr ?? '',
        targetBudgetUtilization: tenant.furyConfig?.targetBudgetUtilization ?? '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const saveSub = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${id}/subscription`, subForm);
      setMsg('Assinatura atualizada');
    } catch { setMsg('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${id}/fury-config`, configForm);
      setMsg('Configurações atualizadas');
    } catch { setMsg('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const createUser = async () => {
    setSaving(true);
    try {
      await api.post('/admin/users', { ...newUser, tenantId: id });
      setMsg('Usuário criado');
      setNewUser({ name: '', email: '', password: '', role: 'member' });
      // reload
      const tRes = await api.get(`/admin/tenants/${id}`);
      setData(tRes.data.data);
    } catch { setMsg('Erro ao criar usuário'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Carregando...</div>;
  if (!data) return <div className="text-zinc-500 text-sm py-12 text-center">Tenant não encontrado</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: 'Usuários' },
    { key: 'subscription', label: 'Assinatura' },
    { key: 'config', label: 'Configurações' },
  ];

  return (
    <div>
      <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{data.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">{data.slug} · {data.users.length} usuários</p>
        </div>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg('')} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">Criar Usuário</h3>
            <div className="grid grid-cols-4 gap-3">
              <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="Nome" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="Email" type="email" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Senha" type="password" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
              <div className="flex gap-2">
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button onClick={createUser} disabled={saving}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
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
                  <tr key={u.id} className="border-b border-zinc-800/50 text-zinc-300">
                    <td className="px-5 py-3">{u.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">{u.role}</span>
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscription Tab */}
      {tab === 'subscription' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Plano</label>
              <select value={subForm.planId} onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Selecione um plano</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} - R$ {(p.priceCents / 100).toFixed(2)}/{p.interval}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
              <select value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                {['trial', 'active', 'past_due', 'cancelled', 'inactive'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Meio de Cobrança</label>
              <select value={subForm.billingType} onChange={(e) => setSubForm({ ...subForm, billingType: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Nenhum</option>
                <option value="BOLETO">Boleto</option>
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">Cartão de Crédito</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Fim do Trial</label>
              <input type="datetime-local" value={subForm.trialEndsAt} onChange={(e) => setSubForm({ ...subForm, trialEndsAt: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Fim do Período Atual</label>
              <input type="datetime-local" value={subForm.currentPeriodEnd} onChange={(e) => setSubForm({ ...subForm, currentPeriodEnd: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
          </div>
          <button onClick={saveSub} disabled={saving}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      )}

      {/* Config Tab */}
      {tab === 'config' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {(['targetRoas', 'targetCpa', 'targetCtr', 'targetBudgetUtilization'] as const).map((field) => (
              <div key={field}>
                <label className="block text-xs font-medium text-zinc-400 mb-1 capitalize">
                  {field.replace('target', 'Target ').replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  value={configForm[field]}
                  onChange={(e) => setConfigForm({ ...configForm, [field]: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
            ))}
          </div>
          <button onClick={saveConfig} disabled={saving}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      )}
    </div>
  );
}
