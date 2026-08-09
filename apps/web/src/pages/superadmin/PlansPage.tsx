import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface PlanLimits {
  creativesPerMonth: number | null;
  modificationsPerCreative: number | null;
}

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  features: Record<string, boolean>;
  limits: PlanLimits;
  isActive: boolean;
  subscriberCount: number;
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    priceCents: 0,
    interval: 'monthly',
    isActive: true,
    limits: { creativesPerMonth: null, modificationsPerCreative: null } as PlanLimits,
  });
  const [editing, setEditing] = useState<Record<string, Partial<Plan>>>({});

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [migrateTo, setMigrateTo] = useState('');

  useEffect(() => {
    api.get('/admin/plans').then((r) => {
      setPlans(r.data.data);
      const eds: Record<string, Partial<Plan>> = {};
      for (const p of r.data.data) {
        eds[p.id] = {};
      }
      setEditing(eds);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const createPlan = async () => {
    if (!newPlan.name || newPlan.priceCents <= 0) return;
    setSaving(true);
    try {
      await api.post('/admin/plans', { ...newPlan, priceCents: Math.round(newPlan.priceCents * 100) });
      setMsg('Plano criado');
      setShowNew(false);
      setNewPlan({ name: '', priceCents: 0, interval: 'monthly', isActive: true, limits: { creativesPerMonth: null, modificationsPerCreative: null } });
      const r = await api.get('/admin/plans');
      setPlans(r.data.data);
    } catch { setMsg('Erro ao criar'); }
    finally { setSaving(false); }
  };

  const savePlan = async (planId: string) => {
    const updates = editing[planId];
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    setSaving(true);
    try {
      await api.patch(`/admin/plans/${planId}`, updates);
      setMsg('Plano atualizado');
      setEditing({ ...editing, [planId]: {} });
      const r = await api.get('/admin/plans');
      setPlans(r.data.data);
    } catch { setMsg('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const setEdit = (planId: string, field: string, value: unknown) => {
    setEditing((prev) => ({
      ...prev,
      [planId]: { ...(prev[planId] || {}), [field]: value },
    }));
  };

  const setLimitEdit = (plan: Plan, field: keyof PlanLimits, raw: string) => {
    const value = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    const base = editing[plan.id]?.limits ?? plan.limits ?? { creativesPerMonth: null, modificationsPerCreative: null };
    setEdit(plan.id, 'limits', { ...base, [field]: value });
  };

  const handleDeleteClick = (plan: Plan) => {
    setDeleteTarget(plan);
    setMigrateTo('');
  };

  const executeDelete = async (withMigration: boolean) => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const params = withMigration && migrateTo ? `?migrateTo=${migrateTo}` : '';
      await api.delete(`/admin/plans/${deleteTarget.id}${params}`);
      setMsg(withMigration ? 'Assinantes migrados e plano deletado' : 'Plano deletado');
      setDeleteTarget(null);
      const r = await api.get('/admin/plans');
      setPlans(r.data.data);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: { code?: string; message?: string; details?: { subscriberCount?: number } } } } })?.response?.data;
      if (data?.error?.code === 'PLAN_HAS_SUBSCRIBERS') {
        setMsg(`Não é possível deletar: ${data.error.message}`);
      } else {
        setMsg('Erro ao deletar plano');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-[#5A605C] text-sm py-12 text-center">Carregando...</div>;

  const otherPlans = deleteTarget ? plans.filter((p) => p.id !== deleteTarget.id) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(30,136,168,0.1)',
            border: '1px solid rgba(30,136,168,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#1E88A8', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold !text-[#ECEDEF]">Planos</h1>
            <span className="text-sm text-[#5A605C]">{plans.length} planos cadastrados</span>
          </div>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="bg-[#1E88A8] hover:bg-[#2299BC] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo Plano
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 bg-[#161714] border border-[#2A2D27] rounded-lg text-sm text-[#ECEDEF] flex items-center justify-between">
          {msg} <button onClick={() => setMsg('')} className="text-[#5A605C] hover:text-[#ECEDEF]">✕</button>
        </div>
      )}

      {showNew && (
        <div className="mb-4 bg-[#161714] border border-[#2A2D27] rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-5 gap-3">
            <input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
              placeholder="Nome do plano" className="bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
            <input type="number" step="0.01" value={newPlan.priceCents || ''} onChange={(e) => setNewPlan({ ...newPlan, priceCents: parseFloat(e.target.value) || 0 })}
              placeholder="Preço (R$)" className="bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
            <select value={newPlan.interval} onChange={(e) => setNewPlan({ ...newPlan, interval: e.target.value })}
              className="bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors">
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
            <button onClick={createPlan} disabled={saving}
              className="bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              Criar
            </button>
            <button onClick={() => setShowNew(false)}
              className="bg-transparent border border-[#2A2D27] text-[#7E8480] hover:text-[#ECEDEF] hover:border-[#3A3D37] rounded-lg text-sm transition-colors">
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#7E8480] mb-1 block">Criativos por mês (vazio = sem limite)</label>
              <input type="number" min={0} value={newPlan.limits.creativesPerMonth ?? ''}
                onChange={(e) => setNewPlan({ ...newPlan, limits: { ...newPlan.limits, creativesPerMonth: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) } })}
                placeholder="Sem limite" className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
            </div>
            <div>
              <label className="text-xs text-[#7E8480] mb-1 block">Modificações por criativo (vazio = sem limite)</label>
              <input type="number" min={0} value={newPlan.limits.modificationsPerCreative ?? ''}
                onChange={(e) => setNewPlan({ ...newPlan, limits: { ...newPlan.limits, modificationsPerCreative: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) } })}
                placeholder="Sem limite" className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {plans.map((plan) => {
          const edit = editing[plan.id] || {};
          const hasChanges = Object.keys(edit).length > 0;
          const effectiveLimits = edit.limits ?? plan.limits ?? { creativesPerMonth: null, modificationsPerCreative: null };
          return (
            <div key={plan.id} className="bg-[#161714] border border-[#2A2D27] rounded-lg p-5 space-y-3 hover:border-[#1E88A8]/30 transition-colors">
              <div className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold mb-3 ${
                plan.name.toUpperCase() === 'STARTER'
                  ? 'bg-[#7E8480]/20 text-[#7E8480]'
                  : plan.name.toUpperCase() === 'PRO'
                    ? 'bg-[#1E88A8]/20 text-[#1E88A8]'
                    : plan.name.toUpperCase() === 'ENTERPRISE'
                      ? 'bg-[#CF6F03]/20 text-[#CF6F03]'
                      : 'bg-[#7E8480]/20 text-[#7E8480]'
              }`}>
                {plan.name.toUpperCase() === 'STARTER' ? 'BÁSICO' : plan.name.toUpperCase() === 'PRO' ? 'INTERMEDIÁRIO' : plan.name.toUpperCase() === 'ENTERPRISE' ? 'EMPRESARIAL' : plan.name}
              </div>
              <div className="grid grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Nome</label>
                  <input value={edit.name ?? plan.name} onChange={(e) => setEdit(plan.id, 'name', e.target.value)}
                    className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Preço</label>
                  <input type="number" step="0.01" value={edit.priceCents !== undefined ? edit.priceCents / 100 : (plan.priceCents / 100)}
                    onChange={(e) => setEdit(plan.id, 'priceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                    className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Intervalo</label>
                  <select value={edit.interval ?? plan.interval} onChange={(e) => setEdit(plan.id, 'interval', e.target.value)}
                    className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors">
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Ativo</label>
                  <select value={String(edit.isActive ?? plan.isActive)} onChange={(e) => setEdit(plan.id, 'isActive', e.target.value === 'true')}
                    className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors">
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => savePlan(plan.id)} disabled={!hasChanges || saving}
                    className="bg-[#1E88A8]/20 hover:bg-[#1E88A8]/35 border border-[#1E88A8]/50 text-[#1E88A8] disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                    <Save className="w-4 h-4" /> Salvar
                  </button>
                  <button onClick={() => handleDeleteClick(plan)} disabled={saving}
                    className="bg-[#C0392B]/15 hover:bg-[#C0392B]/25 disabled:opacity-30 text-[#C0392B] px-3 py-2.5 rounded-lg text-sm transition-colors"
                    title="Deletar plano">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Criativos por mês (vazio = sem limite)</label>
                  <input type="number" min={0} value={effectiveLimits.creativesPerMonth ?? ''}
                    onChange={(e) => setLimitEdit(plan, 'creativesPerMonth', e.target.value)}
                    placeholder="Sem limite" className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
                </div>
                <div>
                  <label className="text-xs text-[#7E8480] mb-1 block">Modificações por criativo (vazio = sem limite)</label>
                  <input type="number" min={0} value={effectiveLimits.modificationsPerCreative ?? ''}
                    onChange={(e) => setLimitEdit(plan, 'modificationsPerCreative', e.target.value)}
                    placeholder="Sem limite" className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors placeholder:text-[#5A605C]" />
                </div>
              </div>
              <div className="text-xs text-[#3E4440]">
                ID: {plan.id} · Features: {Object.keys(plan.features).length}
                {' · '}
                <span className={plan.subscriberCount > 0 ? 'text-[#CF6F03]' : 'text-[#3E4440]'}>
                  {plan.subscriberCount} assinante{plan.subscriberCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete/Migration Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161714] border border-[#2A2D27] rounded-lg p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold text-[#ECEDEF] mb-2">Deletar plano</h2>
            <p className="text-sm text-[#5A605C] mb-4">
              Plano <span className="text-[#ECEDEF] font-medium">{deleteTarget.name}</span>
              {deleteTarget.subscriberCount > 0 ? (
                <> possui <span className="text-[#CF6F03] font-bold">{deleteTarget.subscriberCount} assinante{deleteTarget.subscriberCount !== 1 ? 's' : ''}</span>.</>
              ) : (
                <> não possui assinantes.</>
              )}
            </p>

            {deleteTarget.subscriberCount > 0 ? (
              <>
                <p className="text-sm text-[#5A605C] mb-3">
                  Para deletar, migre os assinantes para outro plano:
                </p>
                <select
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                  className="w-full bg-[#0C0D0A] border border-[#2A2D27] rounded-lg px-4 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 transition-colors mb-4 placeholder:text-[#5A605C]"
                >
                  <option value="">Selecione um plano...</option>
                  {otherPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (R$ {(p.priceCents / 100).toFixed(2)})</option>
                  ))}
                </select>
                <div className="flex gap-3">
                  <button
                    onClick={() => executeDelete(true)}
                    disabled={!migrateTo || saving}
                    className="flex-1 bg-[#1E88A8]/20 hover:bg-[#1E88A8]/35 border border-[#1E88A8]/50 text-[#1E88A8] disabled:opacity-30 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Migrar e deletar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 bg-[#161714] hover:bg-[#1A1C18] border border-[#2A2D27] text-[#7E8480] rounded-lg text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => executeDelete(false)}
                  disabled={saving}
                  className="flex-1 bg-[#C0392B] hover:bg-[#A93225] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Deletar
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-[#161714] hover:bg-[#1A1C18] border border-[#2A2D27] text-[#7E8480] rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}