import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import api from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  features: Record<string, boolean>;
  isActive: boolean;
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', priceCents: 0, interval: 'monthly', isActive: true });
  const [editing, setEditing] = useState<Record<string, Partial<Plan>>>({});

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

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Carregando...</div>;

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
                <button onClick={() => savePlan(plan.id)} disabled={!hasChanges || saving}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  <Save className="w-4 h-4" /> Salvar
                </button>
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                ID: {plan.id} · Features: {Object.keys(plan.features).length}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
