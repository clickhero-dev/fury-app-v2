import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import api from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  features: Record<string, boolean>;
  isActive: boolean;
  subscriberCount: number;
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', priceCents: 0, interval: 'monthly', isActive: true });
  const [editing, setEditing] = useState<Record<string, Partial<Plan>>>({});

  // Delete / migration state
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
      setNewPlan({ name: '', priceCents: 0, interval: 'monthly', isActive: true });
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

  const handleDeleteClick = (plan: Plan) => {
    setDeleteTarget(plan);
    setMigrateTo('');
  };

  const executeDelete = async (withMigration: boolean) => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const params = withMigration && migrateTo
        ? `?migrateTo=${migrateTo}`
        : '';
      await api.delete(`/admin/plans/${deleteTarget.id}${params}`);
      setMsg(withMigration ? 'Assinantes migrados e plano deletado' : 'Plano deletado');
      setDeleteTarget(null);
      const r = await api.get('/admin/plans');
      setPlans(r.data.data);
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: { message?: string; details?: { subscriberCount?: number } } } } })?.response?.data;
      if (data?.error?.code === 'PLAN_HAS_SUBSCRIBERS') {
        setMsg(`Não é possível deletar: ${data.error.message}`);
      } else {
        setMsg('Erro ao deletar plano');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Carregando...</div>;

  const otherPlans = deleteTarget ? plans.filter((p) => p.id !== deleteTarget.id) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Planos</h1>
          <p className="text-sm text-zinc-500 mt-1">{plans.length} planos cadastrados</p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 flex items-center justify-between">
          {msg} <button onClick={() => setMsg('')} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
      )}

      {showNew && (
        <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 grid grid-cols-5 gap-3">
          <input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
            placeholder="Nome do plano" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100" />
          <input type="number" step="0.01" value={newPlan.priceCents || ''} onChange={(e) => setNewPlan({ ...newPlan, priceCents: parseFloat(e.target.value) || 0 })}
            placeholder="Preço (R$)" className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100" />
          <select value={newPlan.interval} onChange={(e) => setNewPlan({ ...newPlan, interval: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100">
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
          <button onClick={createPlan} disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
            Criar
          </button>
          <button onClick={() => setShowNew(false)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm transition-colors">
            Cancelar
          </button>
        </div>
      )}

      <div className="space-y-3">
        {plans.map((plan) => {
          const edit = editing[plan.id] || {};
          const hasChanges = Object.keys(edit).length > 0;
          return (
            <div key={plan.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="grid grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Nome</label>
                  <input value={edit.name ?? plan.name} onChange={(e) => setEdit(plan.id, 'name', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Preço</label>
                  <input type="number" step="0.01" value={edit.priceCents !== undefined ? edit.priceCents / 100 : (plan.priceCents / 100)}
                    onChange={(e) => setEdit(plan.id, 'priceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Intervalo</label>
                  <select value={edit.interval ?? plan.interval} onChange={(e) => setEdit(plan.id, 'interval', e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100">
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Ativo</label>
                  <select value={String(edit.isActive ?? plan.isActive)} onChange={(e) => setEdit(plan.id, 'isActive', e.target.value === 'true')}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100">
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => savePlan(plan.id)} disabled={!hasChanges || saving}
                    className="bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                    <Save className="w-4 h-4" /> Salvar
                  </button>
                  <button onClick={() => handleDeleteClick(plan)} disabled={saving}
                    className="bg-red-600/20 hover:bg-red-600/40 disabled:opacity-30 text-red-400 px-3 py-2.5 rounded-xl text-sm transition-colors"
                    title="Deletar plano">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                ID: {plan.id} · Features: {Object.keys(plan.features).length}
                {' · '}
                <span className={plan.subscriberCount > 0 ? 'text-amber-400' : 'text-zinc-500'}>
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Deletar plano</h2>
            <p className="text-sm text-zinc-400 mb-4">
              Plano <span className="text-zinc-200 font-medium">{deleteTarget.name}</span>
              {deleteTarget.subscriberCount > 0 ? (
                <> possui <span className="text-amber-400 font-bold">{deleteTarget.subscriberCount} assinante{deleteTarget.subscriberCount !== 1 ? 's' : ''}</span>.</>
              ) : (
                <> não possui assinantes.</>
              )}
            </p>

            {deleteTarget.subscriberCount > 0 ? (
              <>
                <p className="text-sm text-zinc-400 mb-3">
                  Para deletar, migre os assinantes para outro plano:
                </p>
                <select
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 mb-4"
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
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  >
                    Migrar e deletar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm transition-colors"
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
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Deletar
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm transition-colors"
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
