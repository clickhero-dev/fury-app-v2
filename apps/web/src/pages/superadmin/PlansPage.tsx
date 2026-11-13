import { useCallback, useEffect, useState } from 'react';
import { Plus, CirclePlus } from 'lucide-react';
import api from '@/lib/api';
import { PlanCard } from './plans/PlanCard';
import { PlanFormModal } from './plans/PlanFormModal';
import { EMPTY_LIMITS, normalizeLimits, planChanges, type PlanDraft, type PlanLimits, type PlanView } from './plans/planForm';

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  interval: string;
  features: Record<string, boolean>;
  limits: PlanLimits;
  isActive: boolean;
  subscriberCount: number;
  blockedViews?: string[];
}

type FormState = { mode: 'new' } | { mode: 'edit'; plan: Plan };

const NEW_PLAN: PlanDraft = { name: '', priceCents: 0, interval: 'monthly', isActive: true, limits: EMPTY_LIMITS, blockedViews: [] };

function toDraft(plan: Plan): PlanDraft {
  return { name: plan.name, priceCents: plan.priceCents, interval: plan.interval, isActive: plan.isActive, limits: normalizeLimits(plan.limits), blockedViews: plan.blockedViews ?? [] };
}

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [migrateTo, setMigrateTo] = useState('');
  const [planViews, setPlanViews] = useState<PlanView[]>([]);

  useEffect(() => {
    api.get('/admin/plans').then((r) => {
      setPlans(r.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
    // funcionalidades que o perfil pode tirar do plano
    api.get('/admin/plans/configurable-views').then((r) => setPlanViews(r.data.data?.views ?? [])).catch(() => {});
  }, []);

  const reloadPlans = async () => {
    const r = await api.get('/admin/plans');
    setPlans(r.data.data);
  };

  const closeForm = useCallback(() => { setForm(null); setFormError(''); }, []);
  // abre sempre sem erro antigo
  const openForm = (next: FormState) => { setFormError(''); setForm(next); };

  const createPlan = async (draft: PlanDraft) => {
    setSaving(true);
    setFormError('');
    try {
      await api.post('/admin/plans', draft);
      setMsg('Plano criado');
      setForm(null);
      await reloadPlans();
    } catch { setFormError('Erro ao criar'); }
    finally { setSaving(false); }
  };

  const savePlan = async (plan: Plan, draft: PlanDraft) => {
    // só os campos alterados
    const updates = planChanges(toDraft(plan), draft);
    if (Object.keys(updates).length === 0) return;
    setSaving(true);
    setFormError('');
    try {
      await api.patch(`/admin/plans/${plan.id}`, updates);
      setMsg('Plano atualizado');
      setForm(null);
      await reloadPlans();
    } catch { setFormError('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDeleteClick = (plan: Plan) => {
    setDeleteTarget(plan);
    setMigrateTo('');
  };

  const executeDelete = async (withMigration: boolean) => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const params = withMigration && migrateTo ? `?migrateTo=${encodeURIComponent(migrateTo)}` : '';
      await api.delete(`/admin/plans/${deleteTarget.id}${params}`);
      setMsg(withMigration ? 'Assinantes migrados e plano deletado' : 'Plano deletado');
      setDeleteTarget(null);
      await reloadPlans();
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

  if (loading) return <div className="text-text-tertiary text-sm py-12 text-center">Carregando...</div>;

  const otherPlans = deleteTarget ? plans.filter((p) => p.id !== deleteTarget.id) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(30,136,168,0.1)',
            border: '1px solid rgba(30,136,168,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }} className="text-[#17708A] dark:text-[#1E88A8]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold text-text-primary">Planos</h1>
            <span className="text-sm text-text-tertiary">{plans.length} planos cadastrados</span>
          </div>
        </div>
        <button onClick={() => openForm({ mode: 'new' })}
          className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5 flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo Plano
        </button>
      </div>

      {msg && (
        <div className="mb-4 px-4 py-3 bg-surface border border-border rounded-2xl text-sm text-text-primary flex items-center justify-between">
          {msg} <button onClick={() => setMsg('')} className="ady-btn text-text-tertiary hover:text-text-primary">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={toDraft(plan)}
            subscriberCount={plan.subscriberCount}
            disabled={saving}
            onEdit={() => openForm({ mode: 'edit', plan })}
            onDelete={() => handleDeleteClick(plan)}
          />
        ))}
        <button
          type="button"
          onClick={() => openForm({ mode: 'new' })}
          aria-label="Novo Plano (card)"
          className="ady-btn min-h-56 rounded-2xl border-2 border-dashed border-admin-border text-admin-text-muted hover:border-admin-petrol hover:text-admin-petrol transition-colors flex flex-col items-center justify-center gap-2 font-semibold"
        >
          <CirclePlus className="w-7 h-7 text-[#17708A] dark:text-[#1E88A8]" />
          Novo Plano
        </button>
      </div>

      {form && (
        <PlanFormModal
          key={form.mode === 'edit' ? form.plan.id : 'new'}
          mode={form.mode}
          initial={form.mode === 'edit' ? toDraft(form.plan) : NEW_PLAN}
          subscriberCount={form.mode === 'edit' ? form.plan.subscriberCount : 0}
          views={planViews}
          saving={saving}
          error={formError}
          onClose={closeForm}
          onSubmit={(draft) => (form.mode === 'edit' ? savePlan(form.plan, draft) : createPlan(draft))}
        />
      )}

      {/* Delete/Migration Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold text-text-primary mb-2">Deletar plano</h2>
            <p className="text-sm text-text-secondary mb-4">
              Plano <strong className="text-text-primary font-medium">{deleteTarget.name}</strong>
              {deleteTarget.subscriberCount > 0 ? (
                <> possui <strong className="text-[#B55F02] dark:text-spark font-bold">{deleteTarget.subscriberCount} assinante{deleteTarget.subscriberCount !== 1 ? 's' : ''}</strong>.</>
              ) : (
                <> não possui assinantes.</>
              )}
            </p>

            {deleteTarget.subscriberCount > 0 ? (
              <>
                <p className="text-sm text-text-secondary mb-3">
                  Para deletar, migre os assinantes para outro plano:
                </p>
                <select
                  value={migrateTo}
                  onChange={(e) => setMigrateTo(e.target.value)}
                  className="w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text focus:outline-none focus:border-admin-petrol focus:ring-2 focus:ring-admin-petrol/30 transition-colors mb-4 placeholder:text-admin-text-faint"
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
                    className="ady-btn bg-brand/10 hover:bg-brand/20 border border-brand/20 text-[#17708A] dark:text-[#1E88A8] disabled:opacity-30 disabled:cursor-not-allowed rounded-full text-sm font-semibold transition-colors flex-1 px-4 py-2.5"
                  >
                    Migrar e deletar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="ady-btn bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 rounded-full text-sm font-semibold transition-colors flex-1 py-2.5"
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
                  className="ady-btn flex-1 bg-[#E5534B] hover:bg-[#E5534B]/90 disabled:opacity-50 text-white px-4 py-2.5 rounded-full text-sm font-semibold transition-colors"
                >
                  Deletar
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="ady-btn bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 rounded-full text-sm font-semibold transition-colors flex-1 py-2.5"
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
